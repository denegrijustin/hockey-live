import { useEffect, useState } from "react";
import { etDay } from "../lib/dates.mjs";

/** The NHL's calendar day (Eastern time), re-read every minute so a page left open rolls over at midnight. */
export function useEtToday(): string {
  const [today, setToday] = useState(() => etDay());
  useEffect(() => {
    const id = setInterval(() => setToday(etDay()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}
