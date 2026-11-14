import test from "node:test";
import assert from "node:assert/strict";
import { RIVALRIES, rivalryForTeams, rivalryForGame, recentHeadToHead, verifiedAllTime } from "../src/lib/rivalries.mjs";
test("27 unique two-team rivalries and order-independent matching",()=>{
 assert.equal(RIVALRIES.length,27);
 assert.equal(new Set(RIVALRIES.map(r=>r.id)).size,27);
 for(const r of RIVALRIES) {
  assert.equal(rivalryForTeams(...r.teams)?.id,r.id);
  assert.equal(rivalryForTeams(...[...r.teams].reverse())?.id,r.id);
 }
 assert.equal(rivalryForTeams("EDM","EDM"),null);
 assert.equal(rivalryForTeams("EDM","UTA"),null);
 assert.equal(rivalryForGame({home:"CGY",away:"EDM"})?.name,"Battle of Alberta");
});
test("recent meetings exclude future, unfinished, unrelated and the viewed game",()=>{
 const game={id:8,home:"EDM",away:"CGY",start:"2026-11-14T20:00:00Z"};
 const mk=(id,start,state,home="EDM",away="CGY")=>({id,start,state,home,away,homeScore:3,awayScore:2,date:start.slice(0,10)});
 const games=[mk(1,"2026-10-01T00:00:00Z","OFF"),mk(2,"2026-11-12T00:00:00Z","LIVE"),mk(3,"2026-11-15T00:00:00Z","OFF"),mk(4,"2026-11-01T00:00:00Z","OFF","EDM","VAN"),mk(5,"2026-11-05T00:00:00Z","FINAL","CGY","EDM"),mk(8,"2026-11-14T20:00:00Z","OFF")];
 assert.deepEqual(recentHeadToHead(games,game).map(g=>g.id),[5,1]);
});
test("uncertified all-time records are never rendered",()=>{
 const base={wins:3,losses:2,ties:0,overtime_losses:1,games:6};
 assert.equal(verifiedAllTime({...base,validation_status:"provisional",display_allowed:true}),null);
 assert.equal(verifiedAllTime({...base,validation_status:"verified",display_allowed:false}),null);
 assert.equal(verifiedAllTime({...base,validation_status:"verified",display_allowed:true,games:7}),null);
 assert.deepEqual(verifiedAllTime({...base,validation_status:"verified",display_allowed:true}).games,6);
});
