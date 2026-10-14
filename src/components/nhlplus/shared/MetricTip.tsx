import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY } from "../../../lib/nhlplus-glossary.mjs";

/**
 * A small "?" that explains a term. Opens on hover, keyboard focus or tap; Escape closes it. Clicks never reach the card
 * it sits on, so using it does not expand or collapse the card.
 */
export function MetricTip({ id, children, className = "" }: { id: keyof typeof GLOSSARY | string; children?: React.ReactNode; className?: string }) {
  const entry = (GLOSSARY as Record<string, { label: string; text: string; derived: boolean }>)[id];
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!entry) return <>{children}</>;
  return (
    <span ref={ref} className={`mp-tipwrap ${className}`.trim()} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <button
        type="button" className="mp-tip" aria-label={`What is ${entry.label}?`} aria-expanded={open} aria-describedby={open ? tipId : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      >?</button>
      {open && <span id={tipId} role="tooltip" className="mp-tooltip"><b>{entry.label}</b>{entry.derived && <em> · derived</em>}<br />{entry.text}</span>}
    </span>
  );
}
