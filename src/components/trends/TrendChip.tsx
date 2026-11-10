/** A small labelled fact ("W3", "+0.8 per game"). tone only reinforces; the text always says it. */
export function TrendChip({ label, value, tone = "flat", title }: { label: string; value: string; tone?: "up" | "down" | "flat"; title?: string }) {
  return <span className={`tr-trend tr-tone-${tone}`} title={title}><small>{label}</small><b>{value}</b></span>;
}
