export type Stat = { k: string; v?: number | null; text?: string; signed?: boolean; derived?: boolean };

/** Labelled season stats. A missing value is a dash, never 0; derived values are marked. */
export function StatGrid({ title, stats, note }: { title: string; stats: Stat[]; note?: string }) {
  const show = (s: Stat) => (s.text !== undefined ? s.text : s.v === null || s.v === undefined || !Number.isFinite(s.v) ? "—" : s.signed && s.v > 0 ? `+${s.v}` : String(s.v));
  return (
    <section className="pp-stats" aria-label={title}>
      <h3>{title}</h3>
      <dl className="pp-grid">
        {stats.map((s) => (
          <div key={s.k}><dt>{s.k}{s.derived ? <abbr title="Derived from other published numbers" className="pp-d"> *</abbr> : null}</dt><dd>{show(s)}</dd></div>
        ))}
      </dl>
      {note && <p className="pp-note">{note}{stats.some((s) => s.derived) ? " * Derived from the other published numbers." : ""}</p>}
    </section>
  );
}
