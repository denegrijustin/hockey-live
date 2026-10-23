// One place that decides which logo a team shows. A vintage logo (public/logos/retro, built from the originals in public/logos/vintage by
// scripts/build-retro-logos.py) replaces the current one whenever the team has one; the current logo is the fallback if a file is missing.
import retro from "../data/retro-logos.json";

export type Ink = "dark" | "light" | "mixed";
type Entry = { file: string; name: string; era: string; ink: Ink };
const RETRO = retro as unknown as Record<string, Entry>;

/** The team's current logo (the fallback). */
export const currentLogoUrl = (id: string) => `/logos/${id}.svg`;
/** True when the team has a vintage logo. */
export const hasRetro = (id: string) => id in RETRO;
/** The logo every screen shows for a team: the vintage one when there is one, else the current one. */
export const logoUrl = (id: string) => (hasRetro(id) ? `/logos/retro/${id}.png` : currentLogoUrl(id));
/**
 * What the mark is mostly drawn in. "dark" ink disappears on a dark page and "light" ink on a light one, so those sit on a contrasting chip
 * (see tokens.css). The current SVG logos are drawn for dark pages, so they count as "light".
 */
export const logoInk = (id: string): Ink => (hasRetro(id) ? RETRO[id].ink : "light");
/** A short caption for the logo, e.g. "Mighty Ducks of Anaheim 1993/94 – 1998/99". */
export const logoEra = (id: string) => (hasRetro(id) ? `${RETRO[id].name} ${RETRO[id].era}` : null);
export const RETRO_IDS = Object.keys(RETRO);
