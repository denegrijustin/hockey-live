/** Placeholder blocks shaped like what is loading (cards or rows) with a soft shimmer, in place of a "Loading…" line. */
export function Skeleton({ rows = 3, kind = "card", label = "Loading" }: { rows?: number; kind?: "card" | "row"; label?: string }) {
  return (
    <div className={`skel ${kind}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-item" key={i} aria-hidden="true">
          <span className="skel-line w60" /><span className="skel-line w90" /><span className="skel-line w40" />
        </div>
      ))}
    </div>
  );
}
