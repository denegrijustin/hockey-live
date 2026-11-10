import { useLayoutEffect, useMemo } from "react";
import { DateStrip } from "./DateStrip";
import { useSelectedDate, writeDateParam } from "../hooks/useSelectedDate";
import { useEtToday } from "../hooks/useEtToday";

/** Is a day in the address (`&date=`)? The Games view opens in its one-day mode then. */
export const hasDateParam = () => {
  try { return new URLSearchParams(location.search).has("date"); } catch { return false; }
};
export const clearDateParam = () => writeDateParam(null);

/** The Games view's day strip. It reports the chosen day through `onDate`; `days` are the days that have games for the followed teams. */
export function GameDayStrip({ days, counts, onDate }: { days: string[]; counts: Record<string, number>; onDate: (day: string) => void }) {
  const today = useEtToday();
  const sel = useSelectedDate({ days, today });
  useLayoutEffect(() => { onDate(sel.date); }, [sel.date, onDate]);
  const shown = useMemo(() => days, [days]);
  return (
    <div className="games-day-strip">
      <DateStrip value={sel.date} onChange={sel.setDate} today={today} days={shown} min={sel.min} max={sel.max} counts={counts} />
    </div>
  );
}
