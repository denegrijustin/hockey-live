// One place that decides which logo a team shows. A vintage logo (public/logos/retro, built from the originals in public/logos/vintage by
// scripts/build-retro-logos.py) replaces the current one whenever the team has one; the current logo is the fallback if a file is missing.
import retro from "../data/retro-logos.json";

export type Ink = "retro" | "light";
type Entry = { file: string; name: string; era: string };
const RETRO = retro as unknown as Record<string, Entry>;

export type LogoMode = "retro" | "current";
// The viewer's choice (Settings → Display → Team logos). The preference store sets it on load and on every change; "retro" is the default.
let mode: LogoMode = "retro";
export const setLogoMode = (m: LogoMode) => { mode = m === "current" ? "current" : "retro"; };
export const getLogoMode = (): LogoMode => mode;

/** The team's current logo (the fallback, and what every screen shows in "current" mode). */
export const currentLogoUrl = (id: string) => `/logos/${id}.svg`;
/** True when the team has a vintage logo. */
export const hasRetro = (id: string) => id in RETRO;
const showsRetro = (id: string) => mode === "retro" && hasRetro(id);
/** The logo every screen shows for a team: the vintage one when there is one, else the current one. */
export const logoUrl = (id: string) => (showsRetro(id) ? `/logos/retro/${id}.png` : currentLogoUrl(id));
/** Which chip a logo sits on: "retro" for a vintage logo (a light chip), "light" for the current SVG fallback, which is drawn for dark pages (a dark chip). */
export const logoInk = (id: string): Ink => (showsRetro(id) ? "retro" : "light");
/** A short caption for the logo, e.g. "Mighty Ducks of Anaheim 1993/94 – 1998/99". */
export const logoEra = (id: string) => (showsRetro(id) ? `${RETRO[id].name} ${RETRO[id].era}` : null);
export const RETRO_IDS = Object.keys(RETRO);
