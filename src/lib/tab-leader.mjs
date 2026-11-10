/**
 * Cross-tab leader election over BroadcastChannel (Phase 5, docs/phase5-live-data.md): of the visible tabs that watch the same thing,
 * ONE polls and broadcasts what it fetched, so N tabs make one request per interval, not N.
 *
 * Protocol (one channel per `name`, e.g. one game): every tab sends {k:"hb", id, hidden} every HB_MS and when it joins or its
 * visibility changes; peers not heard from for PEER_TTL_MS are dropped ({k:"bye"} on a clean close). The leader is the visible
 * tab with the lowest id (ids start with the join time, so the oldest visible tab). A hidden tab never leads, so when every tab is hidden
 * nobody polls, and the tab that is shown next leads at once. A new tab is a follower for SETTLE_MS (long enough to hear the
 * others) and asks for the current data ({k:"msg", data:{t:"need"}}); if nobody answers it leads.
 * Limits: two tabs that become visible in the same instant can both fetch once until the next heartbeat; a leader that dies
 * silently is replaced after PEER_TTL_MS. Without BroadcastChannel (old browsers, some private modes) there is no election:
 * every tab leads and polls independently, the pre-Phase-5 behaviour.
 */
export const HB_MS = 2000;
export const PEER_TTL_MS = 6000;
export const SETTLE_MS = 250;

/**
 * joinLeaderChannel(name, {onLeader(isLeader), onMessage(data)}, env?) -> {isLeader(), post(data), close(), id}
 * env (tests): createChannel(name), now(), isHidden(), doc (visibilitychange target), setTimeout/clearTimeout/setInterval/clearInterval.
 */
export function joinLeaderChannel(name, handlers, env = {}) {
  const now = env.now ?? (() => Date.now());
  const st = env.setTimeout ?? ((...a) => setTimeout(...a)), ct = env.clearTimeout ?? ((t) => clearTimeout(t));
  const si = env.setInterval ?? ((...a) => setInterval(...a)), ci = env.clearInterval ?? ((t) => clearInterval(t));
  const doc = env.doc ?? (typeof document !== "undefined" ? document : null);
  const hiddenNow = env.isHidden ?? (() => !!doc?.hidden);
  const id = `${now().toString(36).padStart(9, "0")}-${Math.random().toString(36).slice(2, 8)}`;
  let channel = null;
  try {
    channel = env.createChannel ? env.createChannel(name) : typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
  } catch {
    channel = null;
  }
  let leader = false;
  const set = (v) => {
    if (v === leader) return;
    leader = v;
    handlers.onLeader?.(leader);
  };
  if (!channel) {
    // No election possible: everybody polls for themselves.
    set(true);
    return { id, isLeader: () => true, post() {}, close() {} };
  }

  const peers = new Map();
  let settled = false;
  const post = (m) => {
    try { channel.postMessage({ ...m, id }); } catch { /* closed channel */ }
  };
  const hb = () => post({ k: "hb", hidden: hiddenNow() });
  const recompute = () => {
    const t = now();
    for (const [pid, p] of peers) if (t - p.seen > PEER_TTL_MS) peers.delete(pid);
    if (!settled || hiddenNow()) return set(false);
    const visible = [...peers].filter(([, p]) => !p.hidden).map(([pid]) => pid);
    set(visible.every((pid) => id < pid));
  };
  channel.onmessage = (ev) => {
    const m = ev?.data;
    if (!m || m.id === id || typeof m.k !== "string") return;
    if (m.k === "hb") {
      const fresh = !peers.has(m.id);
      peers.set(m.id, { hidden: !!m.hidden, seen: now() });
      if (fresh) hb(); // a newcomer learns about us at once
      recompute();
    } else if (m.k === "bye") {
      peers.delete(m.id);
      recompute();
    } else if (m.k === "msg") handlers.onMessage?.(m.data);
  };
  const onVis = () => {
    hb();
    recompute();
  };
  doc?.addEventListener?.("visibilitychange", onVis);
  hb();
  const interval = si(() => {
    hb();
    recompute();
  }, HB_MS);
  interval?.unref?.();
  const settle = st(() => {
    settled = true;
    recompute();
  }, SETTLE_MS);
  settle?.unref?.();
  return {
    id,
    isLeader: () => leader,
    post: (data) => post({ k: "msg", data }),
    close() {
      ct(settle);
      ci(interval);
      doc?.removeEventListener?.("visibilitychange", onVis);
      post({ k: "bye" });
      try { channel.close(); } catch { /* already closed */ }
    },
  };
}
