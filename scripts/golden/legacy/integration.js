/*╔══════════════════════════════════════════════════════════════════╗
  ║  INTEGRATION.JS — iTala mobile (Supabase) → platform (Firebase) ║
  ║                                                                  ║
  ║  Reads FINALISED games from the mobile scorekeeper and proposes ║
  ║  them as scores for scheduler fixtures. It never writes to      ║
  ║  Supabase, and it never writes a score to Firebase on its own:  ║
  ║  a score reaches events/{id}/scores only through an explicit    ║
  ║  admin approval in the pending-results inbox.                   ║
  ║                                                                  ║
  ║  AUTH. The mobile app's read policy is `auth.uid() is not null`,║
  ║  which a bare anon-key request fails and a Supabase ANONYMOUS   ║
  ║  SIGN-IN passes. Anonymous sessions are excluded from every     ║
  ║  write policy over there (is_authed_user()), so this client is  ║
  ║  read-only by construction rather than by convention, and no    ║
  ║  credential is shipped in the bundle.                           ║
  ║                                                                  ║
  ║  INERT BY DEFAULT. With MOBILE_CONFIG blank or absent, no       ║
  ║  client is created, no sign-in is attempted, and every screen   ║
  ║  behaves exactly as it did before this file existed.            ║
  ╚══════════════════════════════════════════════════════════════════╝ */

var Integration = (function () {
  "use strict";

  var sb = null;
  var ready = false;
  var signingIn = null;      // in-flight sign-in, so we sign in once

  /* A finished game whose last event arrived within this window may still
     be receiving replayed offline taps. See "WHAT A ROW ACTUALLY PROMISES"
     in the view's own SQL comment: the tracker pins a tap that fails to
     push and replays it later, so a game can read `final` seconds before
     its last baskets land. Approving inside that window can publish a
     short score with the wrong winner. */
  // 5 minutes, matching the `last_event_at < now() - interval '5 minutes'`
  // guard in the documented scheduler query for this view.
  var SETTLING_MS = 5 * 60 * 1000;

  function configured() {
    return typeof MOBILE_CONFIG !== "undefined" && MOBILE_CONFIG &&
           !!MOBILE_CONFIG.url && MOBILE_CONFIG.url.indexOf("YOUR_") === -1 &&
           !!MOBILE_CONFIG.anonKey && MOBILE_CONFIG.anonKey.indexOf("YOUR_") === -1;
  }

  function init() {
    if (!configured()) {
      console.log("Integration: mobile app not configured — disabled.");
      return false;
    }
    if (typeof supabase === "undefined" || !supabase.createClient) {
      console.warn("Integration: Supabase SDK not loaded — disabled.");
      return false;
    }
    try {
      sb = supabase.createClient(MOBILE_CONFIG.url, MOBILE_CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Its own key, so this session can never collide with the
          // Supabase client db.js uses for image storage.
          storageKey: "itala_mobile_auth"
        }
      });
      ready = true;
      console.log("Integration: mobile app reader ready.");
    } catch (e) {
      console.error("Integration: client init failed:", e);
      ready = false;
    }
    return ready;
  }

  /* Sign in anonymously, once per page. */
  function session() {
    if (!ready) return Promise.reject(new Error("The mobile app integration is not configured."));
    if (signingIn) return signingIn;
    signingIn = sb.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) return r.data.session;
      return sb.auth.signInAnonymously().then(function (r2) {
        if (r2.error) throw new Error(r2.error.message || "Anonymous sign-in failed");
        return r2.data.session;
      });
    }).catch(function (e) {
      signingIn = null;             // let the next call retry
      throw e;
    });
    return signingIn;
  }

  function unwrap(res) {
    if (!res) throw new Error("No response from the mobile app");
    if (res.error) throw new Error(res.error.message || "Query failed");
    return res.data || [];
  }

  /* getSession() resolves with a CACHED session even when the server has
     since dropped that anonymous user, so every query then 401s while the
     cached sign-in promise looks healthy. Detect an auth failure, throw
     the stale session away, and sign in again — once, so a genuine
     permission problem still surfaces instead of looping. */
  function isAuthFailure(e) {
    var m = String((e && e.message) || e || "").toLowerCase();
    return m.indexOf("jwt") !== -1 || m.indexOf("401") !== -1 ||
           m.indexOf("unauthorized") !== -1 || m.indexOf("not authenticated") !== -1 ||
           m.indexOf("invalid claim") !== -1 || m.indexOf("session") !== -1;
  }

  function query(build) {
    return session().then(build).then(unwrap).catch(function (e) {
      if (!isAuthFailure(e)) throw e;
      signingIn = null;
      return sb.auth.signOut().catch(function () {}).then(function () {
        return session().then(build).then(unwrap);
      });
    });
  }

  /* ── Reads ─────────────────────────────────────────────── */

  function listLeagues() {
    return query(function () {
      return sb.from("leagues")
               .select("id,name,season,kind,is_closed,is_archived")
               .order("name");
    });
  }

  function listTeams(leagueId) {
    return query(function () {
      return sb.from("teams")
               .select("id,name,coach,team_only")
               .eq("league_id", leagueId)
               .order("name");
    });
  }

  /* Finalised games for one league. sinceMs filters on finished_at. */
  function listFinals(leagueId, sinceMs) {
    return query(function () {
      var q = sb.from("final_game_scores")
                .select("*")
                .eq("league_id", leagueId)
                .order("finished_at", { ascending: false });
      if (sinceMs) q = q.gt("finished_at", sinceMs);
      return q;
    });
  }

  /* ── Row hygiene ───────────────────────────────────────── */

  /* Rows shaped like results that are not. The view does not flag these,
     so the client must, or the inbox will offer a 0-0 as a result.
       * no events at all — nothing was scored on a phone
       * level score — the tracker allows finishing level after a warning,
         and such a game counts towards neither team's record
       * same team both sides — possible; home/away carry no FK
       * missing finished_at — synced from a build predating the stamp */
  function reviewReason(f) {
    if (!f) return "missing row";
    if (!f.event_count) return "no stats were recorded for this game";
    if (f.home_team_id === f.away_team_id) return "the same team is on both sides";
    if (toMs(f.finished_at) === null) return "no finish time recorded";
    if (f.home_pts === f.away_pts) return "the score is level, so the game has no result";
    return null;
  }

  /* Timestamps from the view arrive in two shapes and it is not safe to
     assume which: finished_at is bigint (a JSON number) and last_event_at
     is timestamptz (an ISO string), but a column type change, a numeric
     cast, or a driver difference flips either one. Getting it wrong is
     silent — Number("2026-…") and Date.parse(1757000000000) both yield
     NaN, which would turn the settling guard off without any error. So
     parse both shapes and report a failure to parse as "unknown". */
  function toMs(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);   // epoch ms as a string
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  /* True while replayed offline taps may still be arriving.

     last_event_at is the SERVER's clock and this runs on the admin's, so
     the difference can come out negative when the two disagree. A
     negative age is clock skew, not a game that finishes in the future:
     treating it as settling would hold the result back forever, so only
     a genuinely recent age counts. */
  function isSettling(f, nowMs) {
    var last = toMs(f && f.last_event_at);
    if (last === null) return false;
    var age = (nowMs || Date.now()) - last;
    return age >= 0 && age < SETTLING_MS;
  }

  /* The view has no updated_at, so "has this changed since we approved
     it?" is answered by the completeness signals instead: a replayed or
     corrected tap changes event_count, last_event_at, or the points. */
  function hasDrifted(rec, f) {
    if (!rec || !f) return false;
    var approvedPts = [rec.homePts, rec.awayPts].join(",");
    var currentPts = [f.home_pts, f.away_pts].join(",");
    if (approvedPts !== currentPts) return true;
    if ((rec.eventCount || 0) !== (f.event_count || 0)) return true;
    if ((rec.lastEventAt || null) !== (f.last_event_at || null)) return true;
    return false;
  }

  /* ── Name normalisation, for PRE-FILLING the link wizard only.
     Never consulted when a result is approved. ─────────────── */
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(bc|fc|team|the|club|basketball)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* platformTeams: [{code,name}]  mobileTeams: [{id,name}] */
  function proposeTeamPairs(platformTeams, mobileTeams) {
    var byNorm = {};
    (mobileTeams || []).forEach(function (mt) {
      var k = norm(mt.name);
      if (!byNorm[k]) byNorm[k] = [];
      byNorm[k].push(mt);
    });
    var pairs = {}, unmatchedPlatform = [], taken = {};
    (platformTeams || []).forEach(function (pt) {
      var bucket = byNorm[norm(pt.name)];
      // Only an unambiguous, unclaimed single match is auto-paired. Two
      // mobile teams normalising to the same string is exactly the case a
      // human has to resolve, so it is deliberately left blank.
      if (bucket && bucket.length === 1 && !taken[bucket[0].id]) {
        pairs[pt.code] = bucket[0].id;
        taken[bucket[0].id] = true;
      } else {
        unmatchedPlatform.push(pt);
      }
    });
    var unmatchedMobile = (mobileTeams || []).filter(function (mt) { return !taken[mt.id]; });
    return { pairs: pairs, unmatchedPlatform: unmatchedPlatform, unmatchedMobile: unmatchedMobile };
  }

  /* ── Matching ──────────────────────────────────────────────
     Exact team-id pairs from the division's link, plus a date
     preference. Never auto-applies anything: every final comes back
     annotated with a state for the inbox to render.

     States:
       approved   already accepted, and unchanged since
       drifted    accepted, but the mobile app's numbers have moved
       review     the row is not a usable result (see reviewReason)
       settling   finished, but events may still be arriving
       unlinked   one or both teams are not in the division's team map
       proposed   exactly one sensible fixture — the normal case
       ambiguous  more than one unscored fixture has this pairing
       unmatched  no unscored fixture has this pairing
     ──────────────────────────────────────────────────────── */
  /* scoredGids: { gid: true } for every fixture that ALREADY has a score.
     It must be supplied by the caller from the scores nodes, because a
     schedule row's own s1/s2 fields are not where scores live — they are
     decorated onto an in-memory copy by the public view and are null or
     stale on a freshly loaded event. Relying on them silently offered
     already-played fixtures as candidates, which is how a result lands on
     the wrong game. */
  function matchFinals(evt, divId, finals, scoredGids, nowMs) {
    scoredGids = scoredGids || {};
    var div = ((evt || {}).divisions || {})[divId] || {};
    var link = div.mobileLink || {};
    var map = link.teams || {};
    var rev = {};
    Object.keys(map).forEach(function (code) { if (map[code]) rev[map[code]] = code; });

    var sources = evt.scoreSources || {};
    var byMobileGame = {};
    Object.keys(sources).forEach(function (gid) {
      if (sources[gid] && sources[gid].mobileGameId) {
        byMobileGame[sources[gid].mobileGameId] = { gid: gid, rec: sources[gid] };
      }
    });

    return (finals || []).map(function (f) {
      var out = {
        final: f,
        homeCode: rev[f.home_team_id] || null,
        awayCode: rev[f.away_team_id] || null,
        candidates: [],
        pick: null,
        existing: null,
        reason: null,
        state: "unmatched"
      };

      var prior = byMobileGame[f.game_id];
      if (prior) {
        out.existing = prior;
        out.state = hasDrifted(prior.rec, f) ? "drifted" : "approved";
        return out;
      }

      var why = reviewReason(f);
      if (why) { out.state = "review"; out.reason = why; return out; }

      if (isSettling(f, nowMs)) {
        out.state = "settling";
        out.reason = "the last stat arrived less than " +
                     Math.round(SETTLING_MS / 60000) + " minutes ago";
        return out;
      }

      if (!out.homeCode || !out.awayCode) {
        out.state = "unlinked";
        out.reason = "a team in this game is not linked to a division team";
        return out;
      }

      var day = dayOf(f);
      (evt.schedule || []).forEach(function (g) {
        if (g.divId !== divId) return;
        if (!g.gid) return;                    // cannot be addressed safely
        if (scoredGids[g.gid]) return;         // already has a score
        var pairMatches =
          (g.team1 === out.homeCode && g.team2 === out.awayCode) ||
          (g.team1 === out.awayCode && g.team2 === out.homeCode);
        if (!pairMatches) return;
        out.candidates.push({ gid: g.gid, game: g, sameDay: !!day && g.day === day });
      });

      var sameDay = out.candidates.filter(function (c) { return c.sameDay; });
      if (sameDay.length === 1) { out.state = "proposed"; out.pick = sameDay[0]; }
      else if (out.candidates.length === 1) { out.state = "proposed"; out.pick = out.candidates[0]; }
      else if (out.candidates.length > 1) { out.state = "ambiguous"; }

      return out;
    });
  }

  /* The view exposes finished_at but not scheduled_at, so the only date a
     result carries is when Finish was tapped. A game scored the next
     morning from notes therefore reports the wrong day — which is why the
     day only ever PREFERS a candidate and never rejects one. Worst case a
     proposal is downgraded to "ambiguous" and shown to a human.

     Resolved in the browser's timezone. If admins and tournaments are in
     different timezones this can shift a late-evening game by a day; the
     same safe direction applies. */
  function dayOf(f) {
    var ms = toMs(f && f.finished_at);
    if (ms === null) return null;
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* Build { gid: true } from the two score nodes. Positional entries only
     count for an event that has not been migrated, matching the read rule
     in applyScoresToSchedule — otherwise a stale positional key would
     make a genuinely unscored fixture look taken.

     0 is a real basketball score, so presence is tested with null/undefined
     rather than truthiness. */
  function scoredGidSet(evt, byIdx, byId) {
    var out = {};
    var migrated = !!(evt && evt.scoresMigratedAt);
    // Either side on its own means a score is already being recorded for
    // that fixture, and approving over it would discard a manual entry.
    var has = function (s) {
      return !!s && ((s.s1 !== null && s.s1 !== undefined) ||
                     (s.s2 !== null && s.s2 !== undefined));
    };
    (evt && evt.schedule ? evt.schedule : []).forEach(function (g, i) {
      if (!g.gid) return;
      if (byId && has(byId[g.gid])) { out[g.gid] = true; return; }
      if (!migrated && byIdx && has(byIdx[i])) out[g.gid] = true;
    });
    return out;
  }

  /* Which side of the fixture each mobile team sits on is decided here,
     by team code and never by position: home/away in the tracker has
     nothing to do with team1/team2 in the schedule. A mismatch throws
     rather than writing something plausible, because it means the link
     is wrong and a silent guess would hide that. */
  function orient(game, homeCode, awayCode, homePts, awayPts) {
    if (!game) throw new Error("Fixture not found");
    if (game.team1 === homeCode && game.team2 === awayCode) return { s1: homePts, s2: awayPts };
    if (game.team1 === awayCode && game.team2 === homeCode) return { s1: awayPts, s2: homePts };
    throw new Error("This result's teams do not match that fixture");
  }

  /* The provenance record written alongside an approved score. */
  function sourceRecord(f, s1, s2, user) {
    return {
      mobileGameId: f.game_id,
      leagueId: f.league_id,
      s1: s1, s2: s2,
      homePts: f.home_pts, awayPts: f.away_pts,
      eventCount: f.event_count || 0,
      lastEventAt: f.last_event_at || null,
      finishedAt: f.finished_at || null,
      approvedBy: (user && user.id) || "unknown",
      approvedAt: Date.now(),
      method: "manual"
    };
  }

  return {
    init: init,
    configured: configured,
    ready: function () { return ready; },
    session: session,
    listLeagues: listLeagues,
    listTeams: listTeams,
    listFinals: listFinals,
    proposeTeamPairs: proposeTeamPairs,
    matchFinals: matchFinals,
    scoredGidSet: scoredGidSet,
    toMs: toMs,
    reviewReason: reviewReason,
    isSettling: isSettling,
    hasDrifted: hasDrifted,
    orient: orient,
    sourceRecord: sourceRecord,
    dayOf: dayOf,
    norm: norm,
    SETTLING_MS: SETTLING_MS
  };
})();
