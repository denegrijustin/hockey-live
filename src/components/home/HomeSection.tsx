import type { ReactNode } from "react";

/**
 * One section of Home: a labelled region with a heading and a count. Callers render it only when they have data.
 * `data-testid="home-section-<id>"` is the contract the specs use; `.sb-group` stays for the older ones.
 */
export function HomeSection({ id, label, count, live, note, className = "", children }: { id: string; label: string; count?: number; live?: boolean; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`sb-group home-section ${className}`.trim()} role="region" aria-label={label} data-testid={`home-section-${id}`}>
      <h2 className="sb-title">
        {live && <i className="sb-livedot" aria-hidden="true" />}
        {label}
        {count != null && <span className="sb-count">{count}</span>}
        {note && <small>{note}</small>}
      </h2>
      {children}
    </section>
  );
}
