/**
 * NHL official-results rivalry audit (provisional until full coverage is demonstrated).
 *
 * Usage: node scripts/audit-rivalry-records.mjs --from 2025 --to 2026
 * Fetches NHL club season schedules, deduplicates final games by ID, computes per-pair
 * regular/playoff records and emits a JSON audit. DOES NOT certify all-time coverage.
 * Runtime Node >=20 with network; no credentials. Never display the output as an
 * all-time record unless all historical franchise-era seasons have been reconciled.
 */
import { RIVALRIES } from "../src/lib/rivalries.mjs";
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:Number(process.argv[i+1]);};
const from=arg("--from",2025),to=arg("--to",2026);
if(!Number.isInteger(from)||!Number.isInteger(to)||from<1917||to>2026||from>to) throw Error("Invalid season window");
const cutoff="2026-11-14";
const seasonString=y=>String(y)+String(y+1);
const requiredTeams=[...new Set(RIVALRIES.flatMap(r=>r.teams))].sort();
const failures=[],all=new Map(),responses=[];
for(let y=from;y<=to;y++){
 for(const team of requiredTeams){
  const url=`https://api-web.nhle.com/v1/club-schedule-season/${team}/${seasonString(y)}`;
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const json=await response.json();
   if(!Array.isArray(json.games))throw Error("Missing games array");
   responses.push({team,season:seasonString(y),gameCount:json.games.length,url});
   for(const raw of json.games){
    if(!raw?.id||!raw?.gameDate||raw.gameDate>cutoff)continue;
    if(raw.gameState!=="OFF" && raw.gameState!=="FINAL")continue;
    const h=raw.homeTeam?.abbrev,a=raw.awayTeam?.abbrev;
    if(!h||!a||!Number.isInteger(raw.homeTeam.score)||!Number.isInteger(raw.awayTeam.score))continue;
    const game={id:raw.id,date:raw.gameDate,home:h,away:a,hs:raw.homeTeam.score,as:raw.awayTeam.score,
      type:raw.gameType,period:raw.gameOutcome?.lastPeriodType??null,season:y};
    const prev=all.get(String(raw.id));
    if(prev&&JSON.stringify(prev)!==JSON.stringify(game)) throw Error(`Conflicting NHL game ${raw.id}`);
    all.set(String(raw.id),game);
   }
  }catch(error){failures.push({team,season:seasonString(y),url,error:String(error)});}
 }
}
const results=RIVALRIES.map(r=>{
 const games=[...all.values()].filter(g=>r.teams.includes(g.home)&&r.teams.includes(g.away));
 const perspective=r.teams[0],opponent=r.teams[1];
 const aggregate=(type)=>{
  const g=games.filter(x=>x.type===type);
  const out={wins:0,losses:0,ties:0,overtime_losses:0,unclassified:0,games:g.length};
  for(const x of g){
   const mine=x.home===perspective?x.hs:x.as,theirs=x.home===perspective?x.as:x.hs;
   if(mine>theirs)out.wins++;
   else if(mine===theirs)out.ties++;
   else if(type===2 && x.season>=1999 && !x.period)out.unclassified++;
   else if(type===2 && x.season>=1999 && x.period!=="REG")out.overtime_losses++;
   else out.losses++;
  }
  return out;
 };
 return {id:r.id,perspective,opponent,regular_season:aggregate(2),playoffs:aggregate(3),
   actual_first_game:games.map(x=>x.date).sort()[0]??null,
   actual_last_game:games.map(x=>x.date).sort().at(-1)??null,
   validation_status:"period_scoped_only",display_allowed:false};
});
const output={cutoff,fromSeason:seasonString(from),toSeason:seasonString(to),source:"NHL official club season schedule",
  scope:"LOADED SEASONS ONLY — NOT ALL-TIME",validation_status:"not_certified",completeRequests:failures.length===0,
  attemptedSchedules:(to-from+1)*requiredTeams.length,successfulSchedules:responses.length,failures,results};
process.stdout.write(JSON.stringify(output,null,2)+"\n");
if(failures.length)process.exitCode=2;
