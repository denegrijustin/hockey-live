// Reproduces tests/fixtures/gc/real-{reg,ot,so}.json from the public NHL API (usage: node tests/fixtures/gc/trim.mjs).
// Trim only removes bulky non-structural fields (highlight clip URLs/ids, replay URLs, radio/logo links); everything else is the API response verbatim.
import { writeFileSync } from "node:fs";
const GAMES = { reg: 2025021312, ot: 2025021300, so: 2025021301 };
const DROP = /^(highlightClip|discreteClip|pptReplayUrl|logo|darkLogo|radioLink)/;
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.test(k)).map(([k, v]) => [k, strip(v)]));
  return o;
};
for (const [k, id] of Object.entries(GAMES)) {
  const j = await (await fetch(`https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`)).json();
  writeFileSync(new URL(`./real-${k}.json`, import.meta.url), JSON.stringify(strip(j)));
}
