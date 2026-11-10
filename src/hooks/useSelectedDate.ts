import { useCallback, useEffect, useMemo, useState } from "react";
import { autoDay, resolveDate, stepDay, withDateParam } from "../lib/date-nav.mjs";
import { isDay } from "../lib/dates.mjs";

const readUrl = (key: string): string | null => {
  try {
    const v = new URLSearchParams(location.search).get(key);
    return v && isDay(v) ? v : null;
  } catch {
    return null;
  }
};
/** Writes (or removes) the date in the address without adding a history entry; the other parameters and the history state stay as they are. */
export function writeDateParam(date: string | null, key = "date") {
  try {
    const next = withDateParam(location.search, date, key);
    if (next === location.search) return;
    history.replaceState(history.state, "", `${location.pathname}${next}${location.hash}`);
  } catch {}
}

/**
 * The day a schedule screen shows. `days` are the days that have games (sorted); `today` is the Eastern day.
 * Until a day is picked the screen follows the automatic day (today, else the next game day, else the last), so it rolls over at midnight.
 * A picked day that is not the automatic one is kept in the address as `&date=YYYY-MM-DD`; a day outside the season's range in the address is ignored.
 */
export function useSelectedDate({ days, today, urlKey = "date" }: { days: string[]; today: string; urlKey?: string }) {
  const [picked, setPicked] = useState<string | null>(() => readUrl(urlKey));
  useEffect(() => {
    const pop = () => setPicked(readUrl(urlKey));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [urlKey]);
  const auto = useMemo(() => autoDay(days, today), [days, today]);
  const date: string = resolveDate({ picked, days, today, urlDate: null });
  const min = days[0] ?? date, max = days.at(-1) ?? date;
  const setDate = useCallback((d: string) => {
    const v = resolveDate({ picked: d, days, today, urlDate: null });
    const follow = v === auto;
    setPicked(follow ? null : v);
    writeDateParam(follow ? null : v, urlKey);
  }, [days, today, auto, urlKey]);
  const step = useCallback((n: number) => setDate(stepDay(days, date, n)), [days, date, setDate]);
  const goToday = useCallback(() => setDate(today), [today, setDate]);
  return {
    date, setDate, step, goToday, picked: picked && date === picked ? picked : null,
    isToday: date === today, min, max,
    hasPrev: stepDay(days, date, -1) !== date, hasNext: stepDay(days, date, 1) !== date,
  };
}
