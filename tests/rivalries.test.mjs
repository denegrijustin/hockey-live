import test from "node:test";
import assert from "node:assert/strict";
import { approvedRivalryMedia, RIVALRY_MEDIA_CANDIDATES, UNCOVERED_RIVALRY_IMAGES } from "../src/lib/rivalry-media.mjs";
import { RIVALRIES, rivalryForTeams, rivalryForGame, recentHeadToHead, verifiedAllTime, rivalryContext } from "../src/lib/rivalries.mjs";
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

test("season series, last ten, winning streak, and playoff evidence respect game cutoff",()=>{
 const view={id:70,home:"CGY",away:"EDM",start:"2026-11-14T20:00:00Z",season:20262027};
 const mk=(id,date,season,type,home,away,hs,as,state="OFF")=>({id,date,start:date+"T22:00:00Z",season,type,home,away,homeScore:hs,awayScore:as,state});
 const gs=[
  mk(1,"2026-10-05",20262027,2,"CGY","EDM",3,4),
  mk(2,"2026-10-25",20262027,2,"EDM","CGY",2,1),
  mk(3,"2025-04-20",20242025,3,"CGY","EDM",2,3),
  mk(4,"2025-04-15",20242025,3,"EDM","CGY",1,4),
  mk(5,"2026-11-13",20262027,2,"EDM","CGY",1,2,"LIVE"),
  mk(6,"2026-11-15",20262027,2,"EDM","CGY",4,2),
  mk(7,"2026-10-20",20262027,2,"EDM","COL",4,2),
  mk(1,"2026-10-05",20262027,2,"CGY","EDM",3,4)
 ];
 const r=rivalryContext(gs,view);
 assert.equal(r.currentSeason.meetings,2);
 assert.equal(r.currentSeason.wins.EDM,2);
 assert.equal(r.currentSeason.wins.CGY,0);
 assert.equal(r.lastTen.length,4);
 assert.equal(r.lastTenWins.EDM,3);
 assert.equal(r.lastTenWins.CGY,1);
 assert.deepEqual(r.streak,{team:"EDM",games:3});
 assert.equal(r.recentPlayoffs.length,2);
 assert.match(r.story,/EDM leads the season series 2–0/);
});
test("uncovered rivals and empty history degrade cleanly",()=>{
 assert.equal(rivalryContext([],{id:1,home:"EDM",away:"UTA",start:"2026-11-14T00:00:00Z"}),null);
 const r=rivalryContext([],{id:1,home:"NYR",away:"NJD",season:20262027,start:"2026-11-14T00:00:00Z"});
 assert.equal(r.streak.team,null);
 assert.equal(r.lastTen.length,0);
 assert.equal(r.currentSeason.wins.NYR,0);
});

test("archival licensing candidates never publish without affirmative app approval and local asset",()=>{
 assert.equal(approvedRivalryMedia(RIVALRY_MEDIA_CANDIDATES,"EDM-VAN").length,0);
 assert.equal(UNCOVERED_RIVALRY_IMAGES.length,3);
 const good={rivalry_id:"EDM-VAN",commercial_app_use_approved:true,asset_url:"/rivalry-media/edm-van.jpg",photographer:"Photo credit",source_url:"https://commons.wikimedia.org/wiki/File:Face_off.jpg",license:"Public domain"};
 assert.equal(approvedRivalryMedia([good],"EDM-VAN").length,1);
 assert.equal(approvedRivalryMedia([{...good,asset_url:"https://external.example/img.jpg"}],"EDM-VAN").length,0);
 assert.equal(approvedRivalryMedia([{...good,privacy_review_required:true}],"EDM-VAN").length,0);
 assert.equal(approvedRivalryMedia([{...good,photographer:""}],"EDM-VAN").length,0);
});
