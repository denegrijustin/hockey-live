import type { SyntheticEvent } from "react";
import { currentLogoUrl, logoInk, logoUrl } from "../lib/logos";

/** If a vintage file fails to load, show the team's current logo instead (once), and chip it as the light-ink SVG it is. */
export function onLogoError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget, id = img.dataset.team;
  if (!id || img.dataset.fell) return;
  img.dataset.fell = "1";
  img.dataset.ink = "light";
  img.src = currentLogoUrl(id);
}

/** A team logo as an <img> with its size fixed (no layout jump) and a contrasting chip where the mark would blend into the page. */
export function TeamLogo({ id, size, className, alt = "", eager = false }: { id: string; size?: number | string; className?: string; alt?: string; eager?: boolean }) {
  return (
    <img
      className={`team-logo${className ? ` ${className}` : ""}`}
      src={logoUrl(id)}
      data-team={id}
      data-ink={logoInk(id)}
      alt={alt}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={onLogoError}
    />
  );
}

/** The same inside an SVG chart: a chip behind the logo (colored by CSS from its ink) and the logo itself. */
export function LogoImage({ id, x, y, size, opacity, title }: { id: string; x: number; y: number; size: number; opacity?: number; title?: string }) {
  return (
    <g className="team-logo-svg" data-ink={logoInk(id)} opacity={opacity}>
      {title && <title>{title}</title>}
      <rect className="logo-chip" x={x - 1} y={y - 1} width={size + 2} height={size + 2} rx={size * 0.22} />
      <image href={logoUrl(id)} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}
