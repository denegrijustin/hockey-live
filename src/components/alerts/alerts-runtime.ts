import { ALERTS_KEY, createAlertStore, diffGames, diffGoals, goalFetchPlan, memoryStorage, relevantEvents, scoreFallback } from "../../lib/alerts.mjs";
import { fetchFeedOnce } from "../../lib/polling";
import type { Prefs } from "../../lib/prefs.ts";
import type { Game, GameFeed } from "../../types";
import { feed, type AlertItem } from "./alertFeed";

/** The alert engine for this tab: diffing, filtering, storing, device notifications. Loaded only once alerts are switched on. */
const storage = (() => { try { void localStorage.length; return localStorage; } catch { return memoryStorage(); } })();
const store = createAlertStore(storage);
const items = () => store.items() as AlertItem[];

export function refresh(fresh: AlertItem[] = []) { feed.set(items(), fresh); }
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === ALERTS_KEY || e.key === null) refresh(); });
}
refresh();

/** Device notification: only when the person granted permission and alerts are on; collapses repeats through `tag`. Never throws. */
export async function showDevice(item: AlertItem) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const opts = { body: item.body, tag: item.id, icon: "/icon-192.png" };
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(item.title, opts);
    else new Notification(item.title, opts);
  } catch {}
}

/** Per game goal state of this tab (eventId -> fingerprint/miss) and goals already announced by the score fallback. Memory only: after a reload
 *  the first tick is a silent baseline and the stored seen-set stops any repeat. */
type GoalState = { ids: Map<number, { fp: string; miss: number; label: string }> | null; quiet: number };
const goalStates = new Map<number, GoalState>();
const MAX_CONCURRENT = 6;

/** Fetch play-by-play for the planned games, at most 6 at once, through the Game Center's own feed URL and cache. */
async function goalEvents(prev: Map<number, unknown>, games: Game[], prefs: Prefs, now: number) {
  const pending = new Set([...goalStates].filter(([, s]) => s.ids && [...s.ids.values()].some((v) => v.miss > 0)).map(([id]) => id));
  const plan = goalFetchPlan(prev, games, prefs, pending, now) as { game: Game; prevTotal: number | null; prevShape: unknown }[];
  const out: unknown[] = [];
  let next = 0;
  const worker = async () => {
    while (next < plan.length) {
      const job = plan[next++];
      const { game } = job;
      const st = goalStates.get(game.id) ?? { ids: null, quiet: 0 };
      const { data } = await fetchFeedOnce<GameFeed>(`/api/game/${game.id}`);
      const plays = data?.plays;
      if (plays && plays.length) {
        const r = diffGoals(st.ids, plays, game, now, { prevTotal: job.prevTotal ?? undefined, quiet: st.quiet });
        goalStates.set(game.id, { ids: r.next, quiet: 0 });
        out.push(...r.events);
      } else {
        // The play feed is unavailable: say only what the scoreboard knows (the total went up) and stay quiet about those goals later.
        const e = scoreFallback(job.prevShape, game, now);
        // (Without a goal state yet there is nothing to stay quiet about: the next success falls back on the scoreboard total.)
        if (e) { if (st.ids) st.quiet += e.delta; out.push(e); }
        goalStates.set(game.id, st);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, plan.length) }, worker));
  return out;
}

/** One poll tick. Returns the snapshot to pass to the next tick (null = no baseline yet). */
export async function tick(prev: Map<number, unknown> | null, games: Game[], prefs: Prefs, now = Date.now()) {
  if (!prev) goalStates.clear();
  const { events, next } = diffGames(prev, games, now);
  let goals: unknown[] = [];
  try { goals = prev ? await goalEvents(prev, games, prefs, now) : []; } catch {}
  const added = store.claim(relevantEvents([...events, ...goals] as never[], prefs)) as AlertItem[];
  if (added.length) {
    refresh(added);
    if (prefs.alerts.enabled) added.forEach((i) => void showDevice(i));
  } else refresh();
  return next;
}
export function markAllRead() { store.markAllRead(); refresh(); }
export function clearAll() { store.clearAll(); refresh(); }
