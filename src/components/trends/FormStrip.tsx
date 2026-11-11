const WORD: Record<string, string> = { W: "win", L: "loss", OTL: "overtime loss" };

/** A row of W / L / OTL chips, oldest first. Letters carry the meaning (colour only reinforces it). */
export function FormStrip({ chips, label }: { chips: string[]; label: string }) {
  if (!chips.length) return <span className="tr-muted">—</span>;
  return (
    <ol className="tr-form" aria-label={`${label}, oldest first: ${chips.map((c) => WORD[c] ?? c).join(", ")}`}>
      {chips.map((c, i) => <li key={i} className={`tr-chip tr-${c.toLowerCase()}`} aria-hidden="true">{c}</li>)}
    </ol>
  );
}
