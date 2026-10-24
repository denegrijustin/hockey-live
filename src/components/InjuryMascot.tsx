import { useEffect, useRef, useState } from "react";
import { useOnScreen } from "../motion";
import { kitFor } from "../lib/kits";
import { logoUrl } from "../lib/logos";

type Pose = { file: string; /** where the chest logo sits, as fractions of the picture, and its size as a fraction of the width */ x: number; y: number; s: number };
export const POSES: Record<string, Pose> = {
  head: { file: "head", x: 0.44, y: 0.6, s: 0.15 },
  shoulder: { file: "shoulder", x: 0.5, y: 0.42, s: 0.15 },
  arm: { file: "arm", x: 0.38, y: 0.45, s: 0.14 },
  hand: { file: "hand", x: 0.45, y: 0.55, s: 0.14 },
  ankle: { file: "ankle", x: 0.32, y: 0.47, s: 0.14 },
  core: { file: "core", x: 0.4, y: 0.38, s: 0.14 },
  "skater-unknown": { file: "skater-unknown", x: 0.5, y: 0.5, s: 0.16 },
  "goalie-leg": { file: "goalie-leg", x: 0.5, y: 0.45, s: 0.15 },
  "goalie-arm": { file: "goalie-arm", x: 0.5, y: 0.45, s: 0.15 },
  "goalie-unknown": { file: "goalie-unknown", x: 0.5, y: 0.5, s: 0.16 },
};

const HEAD = ["head", "neck"], ARM = ["arm"], LEG = ["knee", "calf", "ankle", "foot", "thigh", "hip", "groin", "lower"], TORSO = ["core", "chest", "back"];
/** Which of the ten drawn poses fits where the player is hurt. A goalie has poses for a leg, a shoulder or arm, and "not saying"; any other injury shows the last. */
export function poseFor(goalie: boolean, zone: string): keyof typeof POSES {
  if (goalie) return LEG.includes(zone) ? "goalie-leg" : zone === "shoulder" || zone === "arm" || zone === "hand" || zone === "upper" ? "goalie-arm" : "goalie-unknown";
  if (HEAD.includes(zone)) return "head";
  if (zone === "shoulder") return "shoulder";
  if (ARM.includes(zone)) return "arm";
  if (zone === "hand") return "hand";
  if (LEG.includes(zone)) return "ankle";
  if (TORSO.includes(zone)) return "core";
  return "skater-unknown";
}

/** Teams with a hand-drawn set in their own jersey (public/injury/teams/<ID>/<pose>.webp). Utah wears Arizona's. Everyone else gets the neutral drawing, recoloured. */
const DRAWN = new Set(["ANA", "ARI", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "STL", "TBL", "TOR", "VAN", "VGK", "WPG", "WSH"]);
const ALIAS: Record<string, string> = { UTA: "ARI" };
export const drawnSet = (team: string) => { const t = ALIAS[team] ?? team; return DRAWN.has(t) ? t : null; };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** The drawings are navy and white. Every navy pixel is re-coloured to the team's jersey colour, keeping the shading, and the team logo goes on the chest. */
async function paint(canvas: HTMLCanvasElement, pose: Pose, team: string) {
  const base = await load(`/injury/poses/${pose.file}.webp`);
  canvas.width = base.naturalWidth; canvas.height = base.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(base, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  const [tr, tg, tb] = rgb(kitFor(team).jersey);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const light = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
    const w = Math.min(1, Math.max(0, (b - r - 8) / 30)) * (1 - Math.min(1, Math.max(0, (light - 0.45) / 0.2)));
    if (w <= 0) continue;
    const f = Math.min(1.6, Math.max(0.4, light / 0.24));
    const k = (c: number) => (f <= 1 ? c * f : c + (255 - c) * (f - 1) * 0.5);
    d[i] = r + (k(tr) - r) * w; d[i + 1] = g + (k(tg) - g) * w; d[i + 2] = b + (k(tb) - b) * w;
  }
  ctx.putImageData(img, 0, 0);
  try {
    const logo = await load(logoUrl(team));
    const size = canvas.width * pose.s, cx = canvas.width * pose.x, cy = canvas.height * pose.y;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.strokeStyle = "#1b2430"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
  } catch { /* no logo: the plain jersey is fine */ }
}

/**
 * The injury card's picture: one of ten hand-drawn poses (a skater's head, shoulder, arm, hand, leg or stomach; a goalie's leg or shoulder; or a shrug when the
 * team is not saying), in the team's colours with its logo on the chest. It pops in once when the card scrolls into view.
 */
export function InjuryMascot({ team, goalie, zone, side, label, size = 150 }: { team: string; goalie: boolean; zone: string; side: "left" | "right" | null; label: string; face?: string | null; size?: number }) {
  const ref = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const seen = useOnScreen(ref, true);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const key = poseFor(goalie, zone), pose = POSES[key];
  const drawn = drawnSet(team);
  useEffect(() => {
    if (drawn) return;
    let live = true;
    setReady(false);
    if (canvas.current) paint(canvas.current, pose, team).then(() => live && setReady(true)).catch(() => undefined);
    return () => { live = false; };
  }, [key, team]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoaded(false); }, [key, drawn]);
  const shown = drawn ? loaded : ready;
  return (
    <div ref={ref} className={`inj-figure inj-mascot inj-pose${seen && shown ? " play" : ""}${shown ? " ready" : ""}`} data-zone={zone} data-side={side ?? ""} data-goalie={goalie ? "1" : "0"} data-pose={key} role="img" aria-label={`Injury location: ${label}`}>
      {drawn
        ? <img src={`/injury/teams/${drawn}/${key}.webp`} alt="" style={{ height: size }} decoding="async" onLoad={() => setLoaded(true)} data-testid="inj-art" data-set="team" />
        : <canvas ref={canvas} style={{ width: size }} data-testid="inj-art" data-set="neutral" />}
    </div>
  );
}
