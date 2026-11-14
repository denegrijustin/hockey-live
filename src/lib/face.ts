import type { Team } from "../types";
import { kitFor } from "./kits";

const lum = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 0; const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/**
 * The colours a card or a Game Center takes from a matchup: the home team's own colour as the background, and a bright accent for frames and glows (its second colour
 * when that is bright, else a tint of the first). `away` is the away team's colour, for the header's gradient.
 */
export function faceColors(away: Team, home: Team): { bg: string; accent: string; away: string } {
  const bg = home.cardColor ?? home.color, kit = kitFor(home.id);
  const accent = lum(kit.trim) > 0.5 && kit.trim.toLowerCase() !== "#ffffff" ? kit.trim : `color-mix(in srgb, ${bg} 45%, #fff)`;
  return { bg, accent, away: away.cardColor ?? away.color };
}
