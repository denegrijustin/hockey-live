import { useState } from "react";

const initials = (name: string) => name.split(/[\s-]+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/** The player's picture (from ESPN's feed), or his initials if there is none or it fails to load. The size is fixed, so the layout does not jump. */
export function InjuryHeadshot({ src, name, size = 48 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img className="inj-head" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} data-testid="inj-headshot" />
  ) : (
    <span className="inj-head blank" style={{ width: size, height: size }} aria-hidden="true" data-testid="inj-headshot-fallback">{initials(name)}</span>
  );
}
