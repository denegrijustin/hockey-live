// Jersey colours for the injury cartoon: [jersey, trim]. Pants and gear are worked out from these.
const KITS: Record<string, [string, string]> = {
  ANA: ["#F47A38", "#111111"], BOS: ["#111111", "#FFB81C"], BUF: ["#003087", "#FFB81C"], CGY: ["#C8102E", "#F1BE48"], CAR: ["#CE1126", "#111111"],
  CHI: ["#CF0A2C", "#111111"], COL: ["#6F263D", "#236192"], CBJ: ["#002654", "#CE1126"], DAL: ["#006847", "#8F8F8C"], DET: ["#CE1126", "#FFFFFF"],
  EDM: ["#041E42", "#FF4C00"], FLA: ["#C8102E", "#041E42"], LAK: ["#111111", "#A2AAAD"], MIN: ["#154734", "#A6192E"], MTL: ["#AF1E2D", "#192168"],
  NSH: ["#FFB81C", "#041E42"], NJD: ["#CE1126", "#111111"], NYI: ["#003087", "#F47D30"], NYR: ["#0038A8", "#CE1126"], OTT: ["#C52032", "#111111"],
  PHI: ["#F74902", "#111111"], PIT: ["#111111", "#FFB81C"], SJS: ["#006D75", "#111111"], SEA: ["#001628", "#99D9D9"], STL: ["#002F87", "#FCB514"],
  TBL: ["#002868", "#FFFFFF"], TOR: ["#00205B", "#FFFFFF"], UTA: ["#71AFE5", "#111111"], VAN: ["#00205B", "#00843D"], VGK: ["#B4975A", "#333F42"],
  WSH: ["#041E42", "#C8102E"], WPG: ["#041E42", "#8E9090"],
};
export const kitFor = (team: string): { jersey: string; trim: string } => {
  const [jersey, trim] = KITS[team] ?? ["#2b3a55", "#9fb3c8"];
  return { jersey, trim };
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const lum = (c: number[]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Darken a colour until it reads on white ice (a luminance no higher than `max`). */
const darken = (c: number[], max: number) => { let o = [...c]; for (let i = 0; i < 12 && lum(o) > max; i++) o = o.map((v) => v * 0.88); return o; };

/**
 * Marker colours for a shot map drawn on white ice: each team's jersey colour, darkened enough to show on white, with goals outlined in its second colour
 * (also darkened if it is pale). If the two teams' colours are too alike, the home team uses its second colour so the dots can be told apart.
 */
export function markerColors(away: string, home: string): { away: { fill: string; ring: string }; home: { fill: string; ring: string } } {
  const kit = (t: string) => { const k = kitFor(t); return { fill: darken(rgb(k.jersey), 0.42), trim: darken(rgb(k.trim), 0.58) }; };
  const a = kit(away), h = kit(home);
  if (dist(a.fill, h.fill) < 75) h.fill = darken(rgb(kitFor(home).trim), 0.42);
  if (dist(a.fill, h.fill) < 75) h.fill = [122, 63, 160]; // still alike: a neutral purple for the home side
  const ring = (k: { fill: number[]; trim: number[] }) => (dist(k.fill, k.trim) < 70 ? [17, 17, 17] : k.trim);
  return { away: { fill: toHex(a.fill), ring: toHex(ring(a)) }, home: { fill: toHex(h.fill), ring: toHex(ring(h)) } };
}
