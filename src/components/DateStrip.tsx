import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { stepDay, stepWeek } from "../lib/date-nav.mjs";
import { relativeDay } from "../lib/dates.mjs";
import "../date-strip.css";

const parts = (day: string, o: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
/** "Tuesday, November 10": the full date of a day. */
export const fullDate = (day: string) => parts(day, { weekday: "long", month: "long", day: "numeric" });

/** The day's title and full date, in the markup the Home header has always used (`.sb-day h1` / `.sb-day span`). */
export function DayHeading({ day, today }: { day: string; today: string }) {
  return (
    <div className="sb-day">
      <h1>{relativeDay(day, today)}</h1>
      <span>{fullDate(day)}</span>
    </div>
  );
}

interface Props {
  /** The selected Eastern day (YYYY-MM-DD). */
  value: string;
  onChange: (day: string) => void;
  /** Today's Eastern day. */
  today: string;
  /** The days that have games, sorted. The chips are these days (plus the selected day when it has none). */
  days: string[];
  /** The first and last day the picker accepts. */
  min: string;
  max: string;
  /** Games per day, for the chips' accessible names. */
  counts?: Record<string, number>;
  /** The accessible name of a day's chip; defaults to the full date and game count. */
  labelFor?: (day: string, count: number | undefined) => string;
  id?: string;
}

/**
 * A row for moving through the schedule: previous and next day, a scrollable strip of day chips, a Today button and a native date picker.
 * Fixed height; only the chip row scrolls sideways. Arrows move a day, PageUp/PageDown a week, Home/End to the first/last day, `t` to today.
 */
export function DateStrip({ value, onChange, today, days, min, max, counts, labelFor, id }: Props) {
  const list = useMemo(() => (days.includes(value) ? days : [...days, value].sort()), [days, value]);
  const rail = useRef<HTMLDivElement>(null);
  const [focusNext, setFocusNext] = useState(false);
  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Keep the selected chip in view: scroll the chip row itself (never the page), instantly when motion is reduced.
  useEffect(() => {
    const row = rail.current, chip = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reduced() ? "instant" : "smooth" });
    if (focusNext) { chip.focus({ preventScroll: true }); setFocusNext(false); }
  }, [value, focusNext]);

  const go = (day: string, focus = false) => {
    if (focus) setFocusNext(true);
    if (day !== value) onChange(day);
  };
  const atStart = stepDay(days, value, -1) === value, atEnd = stepDay(days, value, 1) === value;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to: Record<string, string> = {
      ArrowLeft: stepDay(list, value, -1), ArrowRight: stepDay(list, value, 1),
      PageUp: stepWeek(list, value, -1), PageDown: stepWeek(list, value, 1),
      Home: list[0], End: list.at(-1)!,
      t: today, T: today,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    go(to[e.key], true);
  };
  const label = (d: string) => labelFor ? labelFor(d, counts?.[d]) : `${fullDate(d)}${counts?.[d] != null ? `, ${counts[d]} ${counts[d] === 1 ? "game" : "games"}` : ""}`;

  return (
    <div className="date-strip" data-testid="date-strip" id={id} role="group" aria-label="Choose a day">
      <button type="button" className="ds-btn ds-step ds-prev" aria-label="Previous day" disabled={atStart} onClick={() => go(stepDay(days, value, -1))}>
        <span className="ds-flip"><Icon name="chevron" size={20} /></span>
      </button>
      <div className="ds-rail" role="tablist" aria-label="Days" ref={rail} onKeyDown={onKey}>
        {list.map((d) => {
          const on = d === value, has = days.includes(d);
          return (
            <button
              key={d} type="button" role="tab" className={`ds-chip${on ? " on" : ""}${d === today ? " today" : ""}`}
              aria-selected={on} aria-current={d === today ? "date" : undefined} tabIndex={on ? 0 : -1}
              aria-label={label(d)} data-day={d} onClick={() => go(d)}
            >
              <span className="ds-wd">{parts(d, { weekday: "short" })}</span>
              <b className="ds-num">{Number(d.slice(8))}</b>
              <i className={`ds-dot${has ? " has" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button type="button" className="ds-btn ds-step ds-next" aria-label="Next day" disabled={atEnd} onClick={() => go(stepDay(days, value, 1))}>
        <Icon name="chevron" size={20} />
      </button>
      <button type="button" className="ds-btn ds-today" data-testid="date-today" disabled={value === today} onClick={() => go(today)}>Today</button>
      <label className="ds-btn ds-pick">
        <Icon name="calendar" size={20} />
        <input
          type="date" className="ds-date" data-testid="date-picker" aria-label="Pick a date" min={min} max={max} value={value}
          onChange={(e) => { if (e.target.value) go(e.target.value); }}
          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
        />
      </label>
      <span className="sr-only" aria-live="polite">{fullDate(value)}</span>
    </div>
  );
}
