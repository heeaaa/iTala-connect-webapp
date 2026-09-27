/* LEGACY CODE, copied for the Firebase import's verification (MIGRATION_PLAN.md 12.1).
 *
 * Source: iTala-platform/deploy/src/app.js as read on 27/09/2026 (sha256
 * prefix 08a5396751b31f74). This is the build connect.itala.fyi serves: its
 * /src/app.js had the same hash on 27/09/2026. It differs from src/app.js
 * (app-extract.js) only in how scores are applied: by position, and not at
 * all when the event has no scores node (rows keep their own s1/s2). The
 * standings, playoff and schedule code is the same in both builds.
 *
 * The block below is copied VERBATIM (deploy/src/app.js 1429-1432). Do not
 * edit it. The live page ran it on every change to events/{id}/scores
 * (viewEvent, deploy/src/app.js 1363-1367).
 */
/* eslint-disable */
"use strict";

/* deploy/src/app.js 1429-1432 */
function applyScoresToSchedule(evt,scores){
  if(!scores||!evt.schedule)return;
  evt.schedule.forEach(function(g,i){var s=scores[i];if(s){g.s1=s.s1;g.s2=s.s2;}else{g.s1=null;g.s2=null;}});
}

module.exports = { applyScoresToSchedule: applyScoresToSchedule };
