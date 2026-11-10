import { useEffect, useState } from "react";
import { useFeed } from "../lib/polling";
import { useGameCenter } from "../components/gc/GameCenterContext";
import type { Boxscore } from "../types";

const FINAL = ["OFF", "FINAL"];
const NOT_STARTED = ["FUT", "PRE"];

/**
 * The game's box score for the Game Center Team Stats and Players panes. Both panes call this; subscribeFeed shares ONE timer and ONE request per URL,
 * so it is one subscription per game. Live: every 30 s. Not live: 30 s only until the box itself reports a final state (so the last live numbers are
 * replaced by the final ones), then one fetch and no timer. Not started: no request. Deliberately not loadBox (it memoizes forever and would freeze a live game).
 * `data` is null with `error` set when the box score is not published (404) or the API is unreachable; with data present, `error` means "last update failed".
 */
export function useGameBox() {
  const { game, live } = useGameCenter();
  const started = !NOT_STARTED.includes(game.state);
  const [settled, setSettled] = useState(false);
  const { data, error } = useFeed<Boxscore>(started ? `/api/boxscore/${game.id}` : null, live || !settled ? 30000 : 0);
  useEffect(() => {
    setSettled(!live && !!data && FINAL.includes(data.state));
  }, [data, live]);
  return { box: data, error, started, live, loading: started && !data && !error };
}
