import { useEffect, useRef, useState } from "react";
import type { Team } from "../../types";
import { useGameCenter } from "./GameCenterContext";
import { goalsOf, periodLabel } from "./gcFormat";

type Snap = { away: number | null; home: number | null; period: number | null; type: string | null; intermission: boolean; final: boolean; end: string };

/**
 * The Game Center's ONE live region (visually hidden, role=status, aria-live=polite, aria-atomic).
 * It is written only when something changes: a goal ("Goal, FLA 1, CAR 0, 12:04 2nd", scoring team first), a score taken back,
 * a period, overtime, shootout or intermission change, and the final. Changes seen within 700 ms are coalesced into one message.
 * It never speaks on first render, when the feed first arrives (that re-baselines silently), or for the clock.
 */
export function GameAnnouncer({ home, away }: { home: Team; away: Team }) {
  const { game, feed, plays } = useGameCenter();
  const [text, setText] = useState("");
  const src = feed ?? game;
  const prev = useRef<Snap | null>(null);
  const hadFeed = useRef(false);
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalNow = src.state === "OFF" || src.state === "FINAL";
  const goals = goalsOf(feed, plays).filter((g) => g.periodType !== "SO");

  useEffect(() => {
    const now: Snap = { away: src.awayScore ?? null, home: src.homeScore ?? null, period: src.period ?? null, type: src.periodType ?? null, intermission: !!src.intermission, final: finalNow, end: src.end };
    const before = prev.current;
    const rebaseline = !!feed && !hadFeed.current;
    if (feed) hadFeed.current = true;
    prev.current = now;
    if (!before || rebaseline) return;
    const say: string[] = [];
    const score = (first: "away" | "home" = "away") => {
      const a = `${away.id} ${now.away ?? 0}`, h = `${home.id} ${now.home ?? 0}`;
      return first === "away" ? `${a}, ${h}` : `${h}, ${a}`;
    };
    const gained = (now.away ?? 0) + (now.home ?? 0) > (before.away ?? 0) + (before.home ?? 0);
    const lost = (now.away ?? 0) + (now.home ?? 0) < (before.away ?? 0) + (before.home ?? 0);
    if (gained && !(now.type === "SO" || (before.type === "SO" && finalNow))) {
      const scorer = (now.away ?? 0) > (before.away ?? 0) ? "away" : "home";
      const last = goals.at(-1);
      const when = last?.time && goals.length === (now.away ?? 0) + (now.home ?? 0) && last.team === (scorer === "away" ? away.id : home.id) ? `, ${last.time} ${periodLabel(last.period, last.periodType)}` : "";
      say.push(`Goal, ${score(scorer)}${when}`);
    } else if (lost) say.push(`Score changed, ${score()}`);
    if (now.final && !before.final) say.push(`Final${now.end === "OT" ? " in overtime" : now.end === "SO" ? " after a shootout" : ""}, ${score()}`);
    else if (!now.final) {
      if (now.type !== before.type || now.period !== before.period) {
        if (now.type === "SO") say.push("Shootout");
        else if (now.type === "OT") say.push("Overtime");
        else if (now.period) say.push(`${periodLabel(now.period, now.type)} period`);
      } else if (now.intermission && !before.intermission) say.push(`End of ${periodLabel(now.period, now.type)} period`);
    }
    if (!say.length) return;
    queue.current.push(...say);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setText(queue.current.join(". "));
      queue.current = [];
      timer.current = null;
    }, 700);
  }, [src.awayScore, src.homeScore, src.period, src.periodType, src.intermission, finalNow, src.end, feed, away.id, home.id, goals.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="gc-live-region">{text}</div>;
}
