/*+==================================================================+
  |  SCHEDULER.JS - Round-robin + single-elimination bracket         |
  |  - Round-based round-robin (circle method) so that every team    |
  |    plays once in a round before any team plays again             |
  |  - No back-to-back games (120-min minimum gap per team)          |
  |  - Packs games into the earliest available slots (an event that  |
  |    fits inside one day is scheduled inside one day)              |
  |  - Games that do not fit are returned UNSCHEDULED, never dropped |
  |  - Seeded single-elimination playoff bracket generator           |
  +==================================================================+ */

var Scheduler = (function () {
  "use strict";

  var MIN_GAP = 120; // minutes a team must rest between its own games

  /* ---------- time helpers ---------- */
  function formatTime(h, m) {
    var per = h >= 12 ? "PM" : "AM";
    var dh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return dh + ":" + (m < 10 ? "0" + m : m) + " " + per;
  }
  function timeToMin(str) {
    if (!str) return null;
    var m = String(str).match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10), p = m[3].toUpperCase();
    if (p === "PM" && h < 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return h * 60 + mi;
  }
  function isUnscheduled(g) {
    return !g || !g.day || g.day === "TBD" || !g.time || g.time === "TBD";
  }

  /* ---------- slot grid ---------- */
  function buildSlotGrid(eventData) {
    var days = (eventData.scheduleDays || []).slice().sort();
    var courts = parseInt(eventData.courts, 10) || 1;
    var sh = parseInt((eventData.timeStart || "09:00").split(":")[0], 10);
    var sm = parseInt((eventData.timeStart || "09:00").split(":")[1], 10) || 0;
    var eh = parseInt((eventData.timeEnd || "20:00").split(":")[0], 10);
    var em = parseInt((eventData.timeEnd || "20:00").split(":")[1], 10) || 0;
    var endMin = eh * 60 + em;
    var grid = [];
    days.forEach(function (day) {
      var rows = [], h = sh, m = sm;
      while (h * 60 + m < endMin) {
        var cs = [];
        for (var c = 1; c <= courts; c++) cs.push(c);
        rows.push({ day: day, time: formatTime(h, m), timeMin: h * 60 + m, courts: cs });
        m += 60;
        while (m >= 60) { h++; m -= 60; }
      }
      grid.push({ day: day, rows: rows });
    });
    return grid;
  }

  /* ---------- round-robin rounds (circle method) ----------
     Returns an ARRAY OF ROUNDS. Each round is a list of pairings in
     which no team appears more than once. This is what guarantees
     "every team plays once before any team plays twice".            */
  function circleRounds(codes, gamesPerTeam) {
    var teams = codes.slice();
    var n = teams.length;
    if (n < 2) return [];
    if (n % 2 !== 0) { teams.push(null); n++; }
    var maxRounds = n - 1;
    var wanted = (gamesPerTeam && gamesPerTeam > 0) ? Math.min(gamesPerTeam, maxRounds) : maxRounds;
    var fixed = teams[0];
    var rotating = teams.slice(1);
    var rounds = [];
    for (var r = 0; r < wanted; r++) {
      var all = [fixed].concat(rotating);
      var round = [];
      for (var i = 0; i < n / 2; i++) {
        var t1 = all[i], t2 = all[n - 1 - i];
        if (t1 !== null && t2 !== null && t1 !== t2) round.push([t1, t2]);
      }
      if (round.length) rounds.push(round);
      rotating.push(rotating.shift());
    }
    return rounds;
  }

  /* Build rounds for a single division (honouring bracketCount).
     gamesPerTeamOverride, when > 0, wins over the division's own setting -
     used by the post-publish "+ Round Robin" prompt. */
  function divisionRounds(divId, div, gamesPerTeamOverride) {
    var teamCodes = Object.keys(div.teams || {});
    if (teamCodes.length < 2) return [];
    var customG = (gamesPerTeamOverride && gamesPerTeamOverride > 0)
      ? parseInt(gamesPerTeamOverride, 10)
      : ((div.customGamesPerTeam && div.gamesPerTeam) ? parseInt(div.gamesPerTeam, 10) : 0);
    var bc = parseInt(div.bracketCount, 10) || 1;
    var groups = [];
    if (bc <= 1) {
      groups.push({ label: div.name || divId, bracketId: null, codes: teamCodes });
    } else {
      var perB = Math.ceil(teamCodes.length / bc);
      for (var b = 0; b < bc; b++) {
        var bTeams = teamCodes.slice(b * perB, (b + 1) * perB);
        if (bTeams.length < 2) continue;
        var bLabel = String.fromCharCode(65 + b);
        groups.push({
          label: (div.name || divId) + " — Group " + bLabel,
          bracketId: bLabel, codes: bTeams
        });
      }
    }
    // Merge each group's rounds index-by-index (groups share no teams).
    var merged = [];
    groups.forEach(function (grp) {
      var rounds = circleRounds(grp.codes, customG);
      rounds.forEach(function (round, ri) {
        if (!merged[ri]) merged[ri] = [];
        round.forEach(function (p) {
          merged[ri].push({
            divId: divId, bracketId: grp.bracketId,
            t1: p[0], t2: p[1], label: grp.label, type: "group"
          });
        });
      });
    });
    return merged;
  }

  /* Build merged rounds across every division of the event. */
  function buildRounds(eventData) {
    var divs = eventData.divisions || {};
    var merged = [];
    Object.keys(divs).forEach(function (divId) {
      var rounds = divisionRounds(divId, divs[divId]);
      rounds.forEach(function (round, ri) {
        if (!merged[ri]) merged[ri] = [];
        merged[ri] = merged[ri].concat(round);
      });
    });
    return merged;
  }

  /* Flat matchup list (kept for callers that just want the pairings). */
  function collectMatchups(eventData) {
    var out = [];
    buildRounds(eventData).forEach(function (r) { out = out.concat(r); });
    return out;
  }

  /* ==================================================================
     PLACEMENT
     Walks days -> time rows -> courts and drops the highest-priority
     placeable game into each free slot.

     Hard constraints
       - a team rests MIN_GAP minutes between its own games on a day
       - a slot already used by an existing game is skipped

     Pass 1 (per day) additionally refuses to give any team a 2nd game
     that day while a team that still has games left has played none.
     Pass 2 mops up the slots pass 1 deliberately left empty, so that
     capacity is never wasted once everyone has had a game.
     ================================================================== */
  function placeGames(eventData, rounds, existingSchedule) {
    var grid = buildSlotGrid(eventData);
    var placed = [];
    var occupied = {};          // "day|time|court" -> true
    var dayTeamMins = {};       // day -> teamCode -> [minutes played]

    function note(day, time, court, t1, t2) {
      occupied[day + "|" + time + "|" + court] = true;
      var mins = timeToMin(time);
      if (mins === null) return;
      if (!dayTeamMins[day]) dayTeamMins[day] = {};
      [t1, t2].forEach(function (t) {
        if (!t || t === "TBD") return;
        if (!dayTeamMins[day][t]) dayTeamMins[day][t] = [];
        dayTeamMins[day][t].push(mins);
      });
    }

    (existingSchedule || []).forEach(function (g) {
      if (isUnscheduled(g)) return;
      note(g.day, g.time, g.court, g.team1, g.team2);
    });

    var pending = [];
    (rounds || []).forEach(function (round, ri) {
      (round || []).forEach(function (g) {
        var copy = {};
        for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) copy[k] = g[k];
        copy._round = ri;
        pending.push(copy);
      });
    });

    function gamesToday(day, code) {
      return (dayTeamMins[day] && dayTeamMins[day][code]) ? dayTeamMins[day][code].length : 0;
    }
    function restOk(day, code, slotMin) {
      var mins = dayTeamMins[day] && dayTeamMins[day][code];
      if (!mins) return true;
      for (var i = 0; i < mins.length; i++) {
        if (Math.abs(slotMin - mins[i]) < MIN_GAP) return false;
      }
      return true;
    }

    function pick(day, slotMin, strict) {
      // Is there a team with games still to play that has not played today?
      var someoneUnplayed = false;
      if (strict) {
        var seen = {};
        for (var p = 0; p < pending.length && !someoneUnplayed; p++) {
          [pending[p].t1, pending[p].t2].forEach(function (t) {
            if (someoneUnplayed || seen[t]) return;
            seen[t] = true;
            if (gamesToday(day, t) === 0) someoneUnplayed = true;
          });
        }
      }
      var bestIdx = -1, bestScore = Infinity;
      for (var i = 0; i < pending.length; i++) {
        var g = pending[i];
        if (!restOk(day, g.t1, slotMin) || !restOk(day, g.t2, slotMin)) continue;
        var a = gamesToday(day, g.t1), b = gamesToday(day, g.t2);
        // Everyone plays once in a day before anyone plays twice.
        if (strict && someoneUnplayed && a >= 1 && b >= 1) continue;
        // round first, then least-played teams, then earliest matchup
        var score = g._round * 1000 + (a + b) * 10 + i * 0.001;
        if (score < bestScore) { bestScore = score; bestIdx = i; }
      }
      return bestIdx;
    }

    function fill(strict) {
      grid.forEach(function (dayBlock) {
        dayBlock.rows.forEach(function (row) {
          row.courts.forEach(function (court) {
            if (!pending.length) return;
            if (occupied[dayBlock.day + "|" + row.time + "|" + court]) return;
            var idx = pick(dayBlock.day, row.timeMin, strict);
            if (idx < 0) return;
            var g = pending.splice(idx, 1)[0];
            placed.push({
              day: dayBlock.day, time: row.time, court: court,
              divId: g.divId, bracketId: g.bracketId,
              team1: g.t1, team2: g.t2,
              label: g.label, type: g.type || "group",
              s1: null, s2: null
            });
            note(dayBlock.day, row.time, court, g.t1, g.t2);
          });
        });
      });
    }

    fill(true);   // pass 1 - fair spread
    fill(false);  // pass 2 - mop up the slots pass 1 held open

    // Anything still pending has nowhere to go: park it, never drop it.
    pending.forEach(function (g) {
      placed.push({
        day: "", time: "", court: 1,
        divId: g.divId, bracketId: g.bracketId,
        team1: g.t1, team2: g.t2,
        label: g.label, type: g.type || "group",
        s1: null, s2: null
      });
    });

    return placed;
  }

  function sortSchedule(schedule) {
    schedule.sort(function (a, b) {
      var ua = isUnscheduled(a) ? 1 : 0, ub = isUnscheduled(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      if (ua) return 0;
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      var ma = timeToMin(a.time) || 0, mb = timeToMin(b.time) || 0;
      if (ma !== mb) return ma - mb;
      return (a.court || 0) - (b.court || 0);
    });
    return schedule;
  }

  function generateSchedule(eventData) {
    var rounds = buildRounds(eventData);
    if (!rounds.length) return [];
    return sortSchedule(placeGames(eventData, rounds, []));
  }

  /* Round-robin for ONE division, added to an already-published event.
     Skips pairings that already exist in the schedule and fits the new
     games into whatever slots are still open. */
  function generateDivisionRoundRobin(eventData, divId, existingSchedule, gamesPerTeam) {
    var div = (eventData.divisions || {})[divId];
    if (!div) return [];
    var existing = existingSchedule || eventData.schedule || [];
    var seen = {};
    existing.forEach(function (g) {
      if (g.divId !== divId) return;
      if (!g.team1 || !g.team2 || g.team1 === "TBD" || g.team2 === "TBD") return;
      seen[[g.team1, g.team2].sort().join("|")] = true;
    });
    var rounds = divisionRounds(divId, div, gamesPerTeam).map(function (round) {
      return round.filter(function (g) { return !seen[[g.t1, g.t2].sort().join("|")]; });
    }).filter(function (round) { return round.length; });
    if (!rounds.length) return [];
    return placeGames(eventData, rounds, existing);
  }

  /* ==================================================================
     SINGLE-ELIMINATION BRACKET GENERATOR
     ================================================================== */
  function generateBracket(divId, divName, numTeams) {
    if (numTeams < 2) return [];
    var p = 1; while (p < numTeams) p *= 2;
    var prefix = "po_" + divId + "_";
    var gameNum = 0;
    var allGames = [];

    var r1Sources = [];
    for (var i = 0; i < p / 2; i++) {
      var s1 = i + 1;
      var s2 = p - i;
      if (s2 > numTeams) {
        r1Sources.push({ type: "seed", rank: s1 });
      } else {
        gameNum++;
        var bId = prefix + gameNum;
        var roundLabel = numTeams <= 4 ? "Semi" : (numTeams <= 8 ? "Quarter" : "R1");
        allGames.push({
          bracketId: bId, round: 1,
          label: (divName || divId) + " — " + roundLabel + " " + gameNum,
          type: "semi",
          team1Source: { type: "seed", rank: s1 },
          team2Source: { type: "seed", rank: s2 }
        });
        r1Sources.push({ type: "winner", bracketId: bId });
      }
    }

    var currentSources = r1Sources;
    var roundNum = 1;
    while (currentSources.length > 1) {
      roundNum++;
      var nextSources = [];
      var half = currentSources.length / 2;
      for (var j = 0; j < half; j++) {
        var srcA = currentSources[j];
        var srcB = currentSources[currentSources.length - 1 - j];
        gameNum++;
        var bId2 = prefix + gameNum;
        var rLabel = currentSources.length === 2 ? "Finals" : (currentSources.length === 4 ? "Semi" : "R" + roundNum);
        allGames.push({
          bracketId: bId2, round: roundNum,
          label: (divName || divId) + " — " + rLabel + (currentSources.length > 2 ? " " + (j + 1) : ""),
          type: currentSources.length === 2 ? "final" : "semi",
          team1Source: srcA,
          team2Source: srcB
        });
        nextSources.push({ type: "winner", bracketId: bId2 });
      }
      currentSources = nextSources;
    }
    return allGames;
  }

  function resolvePlayoffTeams(game, schedule, standings) {
    function resolveSource(src) {
      if (!src) return "TBD";
      if (src.type === "seed") return standings[src.rank - 1] || "TBD";
      if (src.type === "winner") {
        var ref = null;
        for (var i = 0; i < schedule.length; i++) {
          if (schedule[i].bracketGameId === src.bracketId) { ref = schedule[i]; break; }
        }
        if (!ref) return "TBD";
        if (ref.s1 === null || ref.s1 === undefined || ref.s2 === null || ref.s2 === undefined) return "TBD";
        var s1 = parseInt(ref.s1, 10), s2 = parseInt(ref.s2, 10);
        if (isNaN(s1) || isNaN(s2)) return "TBD";
        if (s1 > s2) return ref.team1;
        if (s2 > s1) return ref.team2;
        return "TBD";
      }
      return "TBD";
    }
    return {
      team1: resolveSource(game.team1Source),
      team2: resolveSource(game.team2Source)
    };
  }

  return {
    MIN_GAP: MIN_GAP,
    generateSchedule: generateSchedule,
    generateDivisionRoundRobin: generateDivisionRoundRobin,
    generateBracket: generateBracket,
    resolvePlayoffTeams: resolvePlayoffTeams,
    buildSlotGrid: buildSlotGrid,
    buildRounds: buildRounds,
    divisionRounds: divisionRounds,
    maxRoundsFor: function (n) { return n < 2 ? 0 : (n % 2 === 0 ? n - 1 : n); },
    collectMatchups: collectMatchups,
    placeGames: placeGames,
    sortSchedule: sortSchedule,
    isUnscheduled: isUnscheduled,
    timeToMin: timeToMin,
    formatTime: formatTime
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Scheduler;
