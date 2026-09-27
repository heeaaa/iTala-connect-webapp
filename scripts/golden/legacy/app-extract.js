/* LEGACY CODE, copied for the golden parity suite (MIGRATION_PLAN.md phase 2).
 *
 * Source: iTala-platform/src/app.js as read on 25/09/2026 (sha256 prefix
 * 4a47d4b61c3c3570). Function bodies are copied VERBATIM from the line
 * ranges noted beside each block. The only additions are the wrappers
 * marked "harness" (to call UI code without the DOM) and the exports at
 * the bottom. Do not edit the verbatim blocks: they are the reference the
 * TypeScript port in src/domain is proven against.
 *
 * Requires the global `Scheduler` (legacy/scheduler.js), provided by
 * scripts/golden/generate.mjs.
 */
/* eslint-disable */
"use strict";

/* app.js 206-237 */
function isUnscheduledGame(g){
  return !g || !g.day || g.day === "TBD" || !g.time || g.time === "TBD";
}
function hhmmToMin(s){
  var p = String(s || "").split(":");
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}
function unscheduleGame(g){ g.day = ""; g.time = ""; g.court = 1; }

/* Any game that no longer fits the event's days / hours / courts is moved
   to the Unscheduled row instead of silently disappearing from the grid.
   Called whenever editor fields are collected, so shrinking the event
   window immediately surfaces the affected games. */
function reconcileSchedule(e){
  if (!e || !e.schedule || !e.schedule.length) return 0;
  var days = {};
  (e.scheduleDays || []).forEach(function(d){ days[d] = true; });
  var startMin = hhmmToMin(e.timeStart || "09:00");
  var endMin   = hhmmToMin(e.timeEnd || "20:00");
  var courts   = parseInt(e.courts, 10) || 1;
  var moved = 0;
  e.schedule.forEach(function(g){
    if (isUnscheduledGame(g)) return;
    var bad = false;
    if (!days[g.day]) bad = true;
    if (!bad) {
      var m = parseTimeMin(g.time);
      if (m < startMin || m >= endMin) bad = true;
    }
    if (!bad && (g.court || 1) > courts) bad = true;
    if (bad) { unscheduleGame(g); moved++; }
  });
  return moved;
}


/* app.js 360-374 */
function buildMatchupCounts(sched, divId, teamCodes) {
  var idx = {};
  teamCodes.forEach(function(t, i) { idx[t] = i; });
  var counts = {};   // "codeA|codeB" (sorted) -> number of games
  var totalGames = 0;
  sched.forEach(function(g) {
    if (!isGroupGame(g, divId)) return;
    if (idx[g.team1] === undefined || idx[g.team2] === undefined) return;
    if (g.team1 === g.team2) return;
    var k = [g.team1, g.team2].sort().join("|");
    counts[k] = (counts[k] || 0) + 1;
    totalGames++;
  });
  return { counts: counts, totalGames: totalGames };
}

/* app.js 1712-1780 */
function isGroupGame(g, divId) {
  if (g.divId !== divId) return false;
  if (g.playoff || g.type === "semi" || g.type === "final") return false;
  if (!g.team1 || !g.team2 || g.team1 === "TBD" || g.team2 === "TBD") return false;
  return true;
}
function hasScore(g) {
  if (g.s1 === null || g.s1 === undefined || g.s2 === null || g.s2 === undefined) return false;
  return !isNaN(parseInt(g.s1, 10)) && !isNaN(parseInt(g.s2, 10));
}

/* Seeding is only meaningful once the whole round robin has been played.
   Until then the table is provisional, so a bracket seeded from it would
   name the wrong teams - show TBD instead. */
function divisionGroupComplete(sched, divId) {
  var total = 0, scored = 0;
  sched.forEach(function (g) {
    if (!isGroupGame(g, divId)) return;
    total++;
    if (hasScore(g)) scored++;
  });
  return total > 0 && scored === total;
}

function resolveAllPlayoffs(evt) {
  var sched = evt.schedule || [];
  var divs = evt.divisions || {};

  // Compute standings per division (for seeding)
  var divStandings = {}; // divId → sorted array of team codes
  Object.keys(divs).forEach(function(dk) {
    var div = divs[dk];
    var tks = Object.keys(div.teams || {});
    var records = {};
    tks.forEach(function(tk) { records[tk] = { code: tk, w: 0, l: 0, pf: 0, pa: 0, diff: 0 }; });
    sched.forEach(function(g) {
      if (!isGroupGame(g, dk)) return;
      if (!hasScore(g)) return;
      var r1 = records[g.team1], r2 = records[g.team2];
      if (!r1 || !r2) return;
      var s1 = parseInt(g.s1), s2 = parseInt(g.s2);
      if (isNaN(s1) || isNaN(s2)) return;
      r1.pf += s1; r1.pa += s2; r2.pf += s2; r2.pa += s1;
      if (s1 > s2) { r1.w++; r2.l++; } else if (s2 > s1) { r2.w++; r1.l++; }
      r1.diff = r1.pf - r1.pa; r2.diff = r2.pf - r2.pa;
    });
    divStandings[dk] = tks.map(function(k) { return records[k]; })
      .sort(function(a, b) { if (b.w !== a.w) return b.w - a.w; if (b.diff !== a.diff) return b.diff - a.diff; return b.pf - a.pf; })
      .map(function(r) { return r.code; });
  });

  // Only hand over a seeding table for divisions whose round robin is
  // finished. An empty table makes every seed source resolve to TBD;
  // winner-of-a-previous-playoff-game sources are unaffected and still
  // resolve as soon as that game has a score.
  var groupComplete = {};
  Object.keys(divs).forEach(function(dk) {
    groupComplete[dk] = divisionGroupComplete(sched, dk);
  });

  // Resolve each playoff game
  sched.forEach(function(g) {
    if (!g.playoff || !g.team1Source) return;
    var standings = groupComplete[g.divId] ? (divStandings[g.divId] || []) : [];
    var resolved = Scheduler.resolvePlayoffTeams(g, sched, standings);
    g.team1 = resolved.team1;
    g.team2 = resolved.team2;
  });
}

/* app.js 1918-1924 */
function parseTimeMin(t){
  var m=t.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if(!m)return 0;
  var h=parseInt(m[1]),mi=parseInt(m[2]),p=m[3].toUpperCase();
  if(p==="PM"&&h<12)h+=12;if(p==="AM"&&h===12)h=0;
  return h*60+mi;
}

/* harness: renderPublicStandings (app.js 1940-1958) computes the table
   inline; lines 1943-1955 below are verbatim, returning `sorted` instead
   of building HTML. */
function publicStandings(evt){
  var divs=evt.divisions||{},sched=evt.schedule||[];var out={};
  Object.keys(divs).forEach(function(dk){
    var div=divs[dk],tks=Object.keys(div.teams||{}),records={};
    tks.forEach(function(tk){records[tk]={code:tk,name:div.teams[tk].name,w:0,l:0,pf:0,pa:0,diff:0,gp:0};});
    sched.forEach(function(g){
      if(g.divId!==dk||g.playoff||g.type==="semi"||g.type==="final")return;
      if(g.s1===null||g.s1===undefined||g.s2===null||g.s2===undefined)return;
      var r1=records[g.team1],r2=records[g.team2];if(!r1||!r2)return;
      var s1=parseInt(g.s1),s2=parseInt(g.s2);if(isNaN(s1)||isNaN(s2))return;
      r1.pf+=s1;r1.pa+=s2;r1.gp++;r2.pf+=s2;r2.pa+=s1;r2.gp++;
      if(s1>s2){r1.w++;r2.l++;}else if(s2>s1){r2.w++;r1.l++;}
      r1.diff=r1.pf-r1.pa;r2.diff=r2.pf-r2.pa;
    });
    var sorted=tks.map(function(k){return records[k];}).sort(function(a,b){if(b.w!==a.w)return b.w-a.w;if(b.diff!==a.diff)return b.diff-a.diff;return b.pf-a.pf;});
    out[dk]=sorted.map(function(t){return {code:t.code,w:t.w,l:t.l,pf:t.pf,pa:t.pa,diff:t.diff,gp:t.gp};});
  });
  return out;
}

/* harness: editorGeneratePlayoff (app.js 759-843) without the DOM. `n`
   replaces the prompt value; alert, autosave and render are dropped.
   Lines 763-839 are verbatim. */
function generatePlayoff(editingEvent, dk, n){
  if(!n||n<2)return;
  var div=editingEvent.divisions[dk];
  var bracketGames=Scheduler.generateBracket(dk,div.name||dk,n);
  if(!editingEvent.schedule) editingEvent.schedule=[];

  var sched=editingEvent.schedule;
  var allDays=(editingEvent.scheduleDays||[]).slice().sort();
  var startH=parseInt((editingEvent.timeStart||"09:00").split(":")[0]);
  var startM=parseInt((editingEvent.timeStart||"09:00").split(":")[1])||0;
  var endH=parseInt((editingEvent.timeEnd||"20:00").split(":")[0]);
  var startOfDayMin=startH*60+startM;
  var endOfDayMin=endH*60;

  // Find the absolute last scheduled game across ALL days
  var lastDay=null, lastMin=0;
  sched.forEach(function(g){
    if(!g.day||g.day==="TBD"||!g.time||g.time==="TBD") return;
    var dayIdx=allDays.indexOf(g.day);
    var gMin=parseTimeMin(g.time);
    var absMin=(dayIdx>=0?dayIdx:0)*1440 + gMin;
    if(absMin > lastMin || lastDay===null){ lastMin=absMin; lastDay=g.day; }
  });

  // Starting point: 1 hour after the last game
  var curDayIdx = lastDay ? allDays.indexOf(lastDay) : 0;
  if(curDayIdx<0) curDayIdx=0;
  var curMin = lastDay ? (parseTimeMin(
    (function(){ var best=0; sched.forEach(function(g){ if(g.day===lastDay&&g.time&&g.time!=="TBD"){ var m=parseTimeMin(g.time); if(m>best)best=m;} }); return fmtMin(best); })()
  ) + 60) : startOfDayMin;

  // If curMin exceeds end of day, roll to next day
  if(curMin>=endOfDayMin){ curDayIdx++; curMin=startOfDayMin; }

  function fmtMin(totalMin){
    var h=Math.floor(totalMin/60), m=totalMin%60;
    var per=h>=12?"PM":"AM"; var dh=h>12?h-12:(h===0?12:h);
    return dh+":"+(m<10?"0"+m:m)+" "+per;
  }

  function findNextFreeSlot(dayIdx, minStart){
    // Find a free court 1 slot at or after minStart on dayIdx
    while(dayIdx < allDays.length){
      var day=allDays[dayIdx];
      var t=minStart;
      while(t < endOfDayMin){
        var timeStr=fmtMin(t);
        var taken=false;
        sched.forEach(function(g){ if(g.day===day && g.time===timeStr && g.court===1) taken=true; });
        if(!taken) return { day:day, time:timeStr, min:t, dayIdx:dayIdx };
        t+=60;
      }
      // No free slot this day, try next
      dayIdx++; minStart=startOfDayMin;
    }
    // Ran out of days — just use the last day with overflow
    return { day:allDays[allDays.length-1]||"TBD", time:fmtMin(minStart), min:minStart, dayIdx:allDays.length-1 };
  }

  var nextDayIdx=curDayIdx, nextMin=curMin;
  bracketGames.forEach(function(bg){
    var slot=findNextFreeSlot(nextDayIdx, nextMin);
    editingEvent.schedule.push({
      day:slot.day, time:slot.time, court:1,
      divId:dk, bracketId:null,
      team1:"TBD", team2:"TBD",
      label:bg.label, type:bg.type,
      s1:null, s2:null,
      playoff:true,
      bracketGameId:bg.bracketId,
      team1Source:bg.team1Source,
      team2Source:bg.team2Source,
      playoffRound:bg.round,
    });
    // Next game starts 1 hour later
    nextMin=slot.min+60;
    nextDayIdx=slot.dayIdx;
    if(nextMin>=endOfDayMin){ nextDayIdx++; nextMin=startOfDayMin; }
  });
}

module.exports = {
  reconcileSchedule: reconcileSchedule,
  buildMatchupCounts: buildMatchupCounts,
  isGroupGame: isGroupGame,
  hasScore: hasScore,
  divisionGroupComplete: divisionGroupComplete,
  resolveAllPlayoffs: resolveAllPlayoffs,
  publicStandings: publicStandings,
  generatePlayoff: generatePlayoff,
  parseTimeMin: parseTimeMin
};
