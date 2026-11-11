export type SplitSide = { label: string; record: string; pct: number | null; extra?: string };

/** Two labelled bars on a shared 0-100% scale (points percentage). A side with no games shows "—" and an empty bar. */
export function SplitBar({ title, sides }: { title: string; sides: [SplitSide, SplitSide] }) {
  return (
    <div className="tr-split" role="group" aria-label={title}>
      {sides.map((s) => (
        <div className="tr-split-row" key={s.label}>
          <span className="tr-split-label">{s.label}</span>
          <span className="tr-split-bar" aria-hidden="true"><i style={{ width: `${s.pct == null ? 0 : Math.round(s.pct * 100)}%` }} /></span>
          <span className="tr-split-val"><b>{s.record}</b>{s.pct == null ? " · —" : ` · ${(s.pct * 100).toFixed(0)}%`}{s.extra ? ` · ${s.extra}` : ""}</span>
        </div>
      ))}
    </div>
  );
}
