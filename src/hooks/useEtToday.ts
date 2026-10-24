import { useEffect, useState } from "react";

/** The NHL's calendar day (Eastern time), re-read every minute so a page left open rolls over at midnight. */
export function useEtToday() {
  const read = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [today, setToday] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setToday(read()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}
