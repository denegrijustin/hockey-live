import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RIVALRIES, verifiedAllTime } from "../src/lib/rivalries.mjs";
const path = fileURLToPath(new URL("../src/data/rivalry-records.json", import.meta.url));
const data = JSON.parse(readFileSync(path,"utf8"));
test("all 27 NHL rivalry pairs have reciprocal official regular season and playoff histories",()=>{
 assert.equal(data.source_url,"https://records.nhl.com/site/api/all-time-record-vs-franchise");
 assert.equal(data.rivalries.length,27);
 const known = new Map(RIVALRIES.map(r=>[r.id,r.teams]));
 for(const record of data.rivalries){
  assert.deepEqual(record.teams,known.get(record.id),record.id);
  const [a,b]=record.teams;
  for(const kind of ["regular_season","playoffs"]){
   const A=verifiedAllTime(record[kind][a]),B=verifiedAllTime(record[kind][b]);
   assert.ok(A && B,`${record.id} ${kind} verification gate`);
   assert.equal(A.games,B.games,`${record.id} ${kind} games`);
   assert.equal(A.ties,B.ties,`${record.id} ${kind} ties`);
   assert.equal(A.wins,B.losses+B.overtime_losses,`${record.id} ${kind} reciprocal wins ${a}`);
   assert.equal(B.wins,A.losses+A.overtime_losses,`${record.id} ${kind} reciprocal wins ${b}`);
  }
 }
});
test("benchmark NHL official examples and historical franchise splits",()=>{
 const lookup=id=>data.rivalries.find(r=>r.id===id);
 assert.deepEqual(
  (({wins,losses,ties,overtime_losses,games})=>[wins,losses,ties,overtime_losses,games])(lookup("BOS-MTL").regular_season.MTL),
  [368,286,103,12,769]
 );
 assert.deepEqual(
  (({wins,losses,ties,overtime_losses,games})=>[wins,losses,ties,overtime_losses,games])(lookup("CGY-EDM").regular_season.EDM),
  [120,126,19,10,275]
 );
 assert.equal(lookup("CGY-EDM").regular_season.EDM.segments,2);
 assert.equal(lookup("COL-DET").regular_season.DET.segments,2);
 assert.equal(lookup("MTL-TOR").regular_season.MTL.segments,3);
 assert.equal(lookup("SEA-VAN").playoffs.SEA.games,0);
 assert.equal(lookup("SEA-VAN").playoffs.VAN.games,0);
});
test("verified data cannot be mutated to corrupt counting without failing gate",()=>{
 const base=data.rivalries[0].regular_season.BOS;
 assert.equal(verifiedAllTime({...base,games:base.games+1}),null);
 assert.equal(verifiedAllTime({...base,display_allowed:false}),null);
 assert.equal(verifiedAllTime({...base,validation_status:"provisional"}),null);
});
