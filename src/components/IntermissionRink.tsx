import { useEffect, useMemo, useRef, useState } from "react";
import { motionOff } from "../motion";
import type { Game, Team } from "../types";
import { INTERMISSION_EXTRA_MS, INTERMISSION_MS, clockText, firstSeenAt, parseClock } from "../lib/intermission.mjs";
import { EXIT_LEFT, FINISH_LEFT, INTERMISSION_S, PREGAME_S, icePrepActive, poseAt, route, sessionKey, smoothLeft, stateAt, sweptQuads } from "../lib/ice-plan.mjs";
import type { Ice3D } from "../lib/ice3d";
import type { Look } from "../lib/ice-textures";
import { logoUrl } from "../lib/logos";
import { usePrefs } from "../lib/prefs";
import { faceColors } from "../lib/face";
import { TeamLogo } from "./TeamLogo";
import "./rink-panel.css";

const SEEN = (g: Game) => `iceboard-int-${g.id}-${g.period ?? 0}`;
const SCOUTS = "/logos/kc-scouts.png";
const ASPECT = 0.43;                  // the picture's height / width (fixed camera)
const hashOf = (id: number | string) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/**
 * The seconds left to the next period (or to puck drop) as a plain function of the clock, so the animation can ask for it every frame without
 * a React re-render. Intermission: the feed's clock plus 90 seconds, run on between polls (or 18 minutes plus 90 seconds from when it was first seen). Pregame: the scheduled start.
 */
function useDeadline(game: Game, mode: "intermission" | "pregame") {
  const base = mode === "intermission" ? parseClock(game.clock) : null;
  const reading = useRef({ base, at: Date.now() });
  if (reading.current.base !== base) reading.current = { base, at: Date.now() };
  const [seenAt] = useState(() => (mode === "intermission" ? firstSeenAt(() => localStorage, SEEN(game), Date.now()) : Date.now()));
  const deadline = useRef(0);
  deadline.current = mode === "pregame" ? Date.parse(game.start) : reading.current.base != null ? reading.current.at + reading.current.base * 1000 + INTERMISSION_EXTRA_MS : seenAt + INTERMISSION_MS + INTERMISSION_EXTRA_MS;
  return deadline;
}

/**
 * At most this many 3D rinks are alive at once. A night with several games in intermission would otherwise run several WebGL scenes together, which is heavy for a phone
 * (and for any software renderer); the rest keep their countdown and labels and take over a rink as soon as one frees up. A rink also waits until it is on screen.
 */
const MAX_SCENES = 2;
let sceneCount = 0;
const waiting = new Set<() => void>();
const takeSlot = () => (sceneCount < MAX_SCENES ? (sceneCount++, true) : false);
const freeSlot = () => { sceneCount = Math.max(0, sceneCount - 1); for (const wake of [...waiting]) { waiting.delete(wake); wake(); if (sceneCount >= MAX_SCENES) break; } };

/** Which picture each person prefers: the close shot that follows the machine, or the whole rink at once. Kept on this device and shared by every rink on the page. */
type RinkView = "follow" | "overview";
const VIEW_KEY = "iceboard-rink-view", VIEW_EVENT = "iceboard-rink-view";
let rinkView: RinkView = (() => { try { return localStorage.getItem(VIEW_KEY) === "overview" ? "overview" : "follow"; } catch { return "follow"; } })();
function useRinkView(): [RinkView, (v: RinkView) => void] {
  const [v, setV] = useState<RinkView>(rinkView);
  useEffect(() => { const on = () => setV(rinkView); window.addEventListener(VIEW_EVENT, on); return () => window.removeEventListener(VIEW_EVENT, on); }, []);
  const set = (n: RinkView) => { rinkView = n; try { localStorage.setItem(VIEW_KEY, n); } catch { /* storage unavailable: the choice still holds for this visit */ } window.dispatchEvent(new Event(VIEW_EVENT)); };
  return [v, set];
}

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });

type Labels = { k: string; l: string; cap: string };
/** The broadcast status line under the clock (the pill), by the plan's status. */
const STATUS_TEXT: Record<string, string> = { "NETS OFF": "NETS OFF • ZAMBONI NEXT", "NETS IN": "NETS IN • PEGGING THE GOALS", RESURFACING: "ON ICE • RESURFACING", "SLUSH DUMP": "SLUSH DUMP • EXITING GATE", "ICE CREW": "ICE CREW • CLEARING THE SLUSH", "ICE READY": "ICE READY" };
function labelsFor(mode: "intermission" | "pregame", game: Game, left: number, phase: string, away: Team, home: Team, status = ""): Labels {
  const next = game.period ? (game.period >= 3 ? "overtime" : `period ${game.period + 1}`) : "the next period";
  const working = phase === "enter" || phase === "clean" || phase === "approach" || phase === "wait" || phase === "nets";
  const dumping = phase === "dump";
  const leaving = phase === "exit";
  const crew = phase === "gone" && status === "ICE CREW";
  const netsOff = phase === "nets", netsIn = phase === "gone" && status === "NETS IN";
  if (mode === "pregame") {
    return working || leaving
      ? { k: "PREGAME · ICE PREPARATION", l: left > 0 ? "until puck drop" : "puck drop", cap: `${netsOff ? "the nets are coming off the ice for the Zamboni" : dumping ? "the Zamboni is dumping its slush at the gate" : leaving ? "the Zamboni is leaving the ice" : "the Zamboni is preparing the ice"}` }
      : { k: "ICE READY · AWAITING PUCK DROP", l: left > 0 ? "until scheduled puck drop" : "waiting for the game to start", cap: crew ? "the ice crew is clearing the slush" : netsIn ? "the nets are going back on" : `the ice is ready` };
  }
  return {
    k: `INTERMISSION${game.period ? ` · END OF P${game.period}` : ""}`,
    l: left > 0 ? `until ${next}` : `${next} about to start`,
    cap: `${netsOff ? "the nets are coming off the ice for the Zamboni" : netsIn ? "the nets are going back on and being pegged to the goal lines" : working ? "the Zamboni is resurfacing the ice" : dumping ? "the Zamboni is dumping its slush at the gate" : leaving ? "the Zamboni is leaving the ice" : crew ? "the ice crew is clearing the slush" : "fresh ice for the next period"}`,
  };
}

/**
 * Between periods (and for the 20 minutes before puck drop): the countdown and a Zamboni resurfacing the ice. One route and one timeline
 * (lib/ice-plan.mjs) place the machine, point it and decide which ice is clean; this component only feeds it the countdown and draws.
 * The drawing loop lives outside React state, so re-renders and countdown updates never restart it.
 */
export function IntermissionRink({ game, home, away, compact = false, mode = "intermission" }: { game: Game; home: Team; away: Team; compact?: boolean; mode?: "intermission" | "pregame" }) {
  const deadline = useDeadline(game, mode);
  const logos = usePrefs().display.logos;
  const [view, setView] = useRinkView();
  const viewRef = useRef(view); viewRef.current = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const kRef = useRef<HTMLSpanElement>(null), tRef = useRef<HTMLElement>(null), lRef = useRef<HTMLSpanElement>(null), xRef = useRef<HTMLElement>(null), pRef = useRef<HTMLSpanElement>(null), capRef = useRef<HTMLParagraphElement>(null);
  const gameRef = useRef(game); gameRef.current = game;
  const teams = useRef({ home, away }); teams.current = { home, away };
  const session = sessionKey(mode, game.id, game.period);
  const color = home.cardColor ?? home.color;
  const initial = useMemo(() => labelsFor(mode, game, (deadline.current - Date.now()) / 1000, stateAt((deadline.current - Date.now()) / 1000, mode === "pregame" ? PREGAME_S : INTERMISSION_S).phase, away, home), []); // eslint-disable-line react-hooks/exhaustive-deps
  const left0 = Math.max(0, (deadline.current - Date.now()) / 1000);

  // the scene: built once per intermission (or pregame) and per home team; the loop reads everything else through refs
  useEffect(() => {
    const el = canvas.current, host = root.current;
    if (!el || !host) return;
    const look: Look = { homeId: home.id, homeName: home.name, color: color || "#1d428a", accent: "#f1b82c", seed: hashOf(`${game.id}`), logo: null, scouts: null };
    let scene: Ice3D | null = null;
    const dpr = () => Math.min(2.5, window.devicePixelRatio || 1);
    // texture detail follows the picture's real size: a wide card (a Home card on a desktop is over 1000px) needs the full-size ice and mask, or the whole-rink view looks soft
    const quality = (host.clientWidth || 0) * Math.min(2, window.devicePixelRatio || 1) >= 900 ? "high" : "low";
    let alive = true;
    host.dataset.render = "loading";
    let started = false, holdsSlot = false, gen = 0;
    const tryStart = async () => {
      if (started || !alive) return;
      if (!takeSlot()) { host.dataset.render = "none"; waiting.add(tryStartIfSeen); return; }
      started = true; holdsSlot = true;
      const my = ++gen, live = () => alive && my === gen; // a rink that scrolls away mid-build drops this build
      const images = Promise.all([loadImage(logoUrl(home.id)), loadImage(SCOUTS)]);
      try {
        // the 3D scene (Three.js) loads only when a rink is on screen, and only once the browser has painted what the person just asked for (a Game Center opening, say)
        await new Promise<void>((done) => { const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback; if (ric) ric(() => done(), { timeout: 1500 }); else setTimeout(done, 300); });
        if (!live()) return;
        const { Ice3D: Scene } = await import("../lib/ice3d");
        if (!live()) return;
        const [homeLogo, scouts] = await images;
        if (!live()) return;
        const full = { ...look, logo: homeLogo, scouts };
        const sc = new Scene(el, full, { poseAt, sweptQuads, enterEnd: route().enterEnd }, quality);
        await sc.init("/models/zamboni.glb");
        if (!live()) { sc.dispose(); return; }
        sc.resize(host.clientWidth || 600, Math.round((host.clientWidth || 600) * ASPECT), dpr());
        sc.setView(viewRef.current);
        scene = sc; sceneRef.current = sc; lookRef.current = full;
        host.dataset.render = "webgl";
      } catch {
        host.dataset.render = "none"; // no WebGL: the countdown and the labels still work
        if (holdsSlot && my === gen) { holdsSlot = false; freeSlot(); }
      }
    };
    // A rink that has been off screen for a few seconds gives its scene back, so the rink being looked at can have one (only MAX_SCENES run at once);
    // it builds again when it comes back, and the cleaned ice is redrawn from the countdown.
    let hideTimer = 0;
    const stop = () => {
      gen++; started = false;
      scene?.dispose(); scene = null; sceneRef.current = null;
      if (holdsSlot) { holdsSlot = false; freeSlot(); }
      host.dataset.render = "none";
    };
    let seen = typeof IntersectionObserver === "undefined";
    const tryStartIfSeen = () => { if (seen && visible) void tryStart(); };
    const total = (() => { const first = (deadline.current - Date.now()) / 1000; return Math.max(mode === "pregame" ? PREGAME_S : INTERMISSION_S, first); })();
    let display: number | null = null, last = performance.now(), raf = 0, visible = typeof IntersectionObserver === "undefined", lastSecond = -1, lastPhase = "";
    const reduced = motionOff();
    const tick = (now: number) => {
      const dt = Math.min(5, Math.max(0, (now - last) / 1000)); last = now;
      const target = (deadline.current - Date.now()) / 1000;
      // after a pause (hidden tab, off screen) or a big gap, show the true state at once instead of replaying; otherwise absorb corrections smoothly
      const shown: number = display == null || dt > 1 || reduced ? target : smoothLeft(display, target, dt);
      display = shown;
      const st = stateAt(shown, total);
      scene?.render(st);
      // what the animation is showing, for tests and for anyone inspecting it
      const r = route(), pose = poseAt(st.s);
      host.dataset.phase = st.phase; host.dataset.status = st.site.status; host.dataset.pile = st.site.pile.toFixed(2); host.dataset.crew = st.site.crew ? "on" : "off";
      host.dataset.clean = String(Math.round((1000 * (st.clean - r.enterEnd)) / (r.spiralEnd - r.enterEnd)) / 10);
      host.dataset.left = String(Math.round(shown * 10) / 10);
      host.dataset.pose = `${pose.x.toFixed(1)},${pose.y.toFixed(1)},${((pose.heading * 180) / Math.PI).toFixed(1)}`;
      const sec = Math.max(0, Math.floor(target));
      if (sec !== lastSecond || st.phase !== lastPhase) {
        lastSecond = sec; lastPhase = st.phase;
        const L = labelsFor(mode, gameRef.current, target, st.phase, teams.current.away, teams.current.home, st.site.status);
        if (tRef.current) tRef.current.textContent = clockText(Math.max(0, target));
        if (kRef.current) kRef.current.textContent = L.k;
        if (lRef.current) lRef.current.textContent = L.l;
        if (xRef.current) xRef.current.textContent = st.site.exitIn > 0 ? clockText(st.site.exitIn) : "EXITED";
        if (pRef.current) { pRef.current.textContent = STATUS_TEXT[st.site.status] ?? st.site.status; pRef.current.dataset.status = st.site.status; }
        const done = Number(host.dataset.clean), progress = (st.phase === "clean" || st.phase === "approach") && done >= 1 ? ` · ${Math.min(100, Math.round(done))}% done` : "";
        if (capRef.current) capRef.current.lastChild!.textContent = ` ${L.cap}${progress}`;
      }
    };
    // A frame costs a couple of milliseconds on a GPU, but a software renderer or a weak phone can take hundreds, which would stall the whole page. So the loop
    // times its own frames and spaces them out to use about a quarter of the main thread at most; on normal hardware this never skips a frame.
    let cost = 0, nextAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now < nextAt) return;
      const t0 = performance.now();
      tick(now);
      const spent = performance.now() - t0;
      cost = cost ? cost * 0.6 + spent * 0.4 : spent;
      nextAt = cost > 12 ? now + Math.min(800, cost * 3) : 0;
    };
    tick(performance.now()); // the first reading is always taken (labels, stage, countdown), even for a rink that is not on screen yet
    if (!reduced) raf = requestAnimationFrame(loop);
    const slow = reduced ? window.setInterval(() => tick(performance.now()), 1000) : 0;
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      clearTimeout(hideTimer);
      if (visible) { display = null; seen = true; void tryStart(); }
      else if (started) hideTimer = window.setTimeout(stop, 4000);
    });
    io?.observe(host);
    if (!io) void tryStart();
    const onShow = () => { if (!document.hidden) { display = null; last = performance.now(); } };
    document.addEventListener("visibilitychange", onShow);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { const w = host.clientWidth || 600; scene?.resize(w, Math.round(w * ASPECT), dpr()); });
    ro?.observe(host);
    return () => { alive = false; clearTimeout(hideTimer); waiting.delete(tryStartIfSeen); scene?.dispose(); sceneRef.current = null; if (holdsSlot) freeSlot(); cancelAnimationFrame(raf); clearInterval(slow); io?.disconnect(); ro?.disconnect(); document.removeEventListener("visibilitychange", onShow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, home.id, color, mode]);

  // a change of logo style swaps the logo on the sheet (and the boards) without restarting anything: the cleaned ice stays as it is
  const sceneRef = useRef<Ice3D | null>(null), lookRef = useRef<Look | null>(null);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  useEffect(() => {
    let alive = true;
    loadImage(logoUrl(home.id)).then((img) => { if (alive && sceneRef.current && lookRef.current && lookRef.current.logo !== img) { lookRef.current = { ...lookRef.current, logo: img }; sceneRef.current.setLook(lookRef.current); } });
    return () => { alive = false; };
  }, [logos, home.id]);

  return (
    <section ref={root} style={{ ["--face-bg" as never]: faceColors(away, home).bg, ["--face-accent" as never]: faceColors(away, home).accent } as never} className={`intermission ice-prep-${mode}${compact ? " compact" : ""}`} data-testid="intermission" data-mode={mode} data-view={view} aria-label={`${initial.k}. ${clockText(left0)} ${initial.l}`}>
      <div className="int-count" aria-hidden="true">
        <span className="int-k" ref={kRef}>{initial.k}</span>
        <strong className="int-t" ref={tRef}>{clockText(left0)}</strong>
        <span className="int-l" ref={lRef}>{initial.l}</span>
        <div className="int-bug" data-testid="int-bug">
          <span className="int-exit"><i>ICE EXIT (AT {clockText(EXIT_LEFT)})</i><b ref={xRef}>{clockText(Math.max(0, left0 - EXIT_LEFT))}</b></span>
          <span className="int-pill" ref={pRef} data-status="RESURFACING">{STATUS_TEXT.RESURFACING}</span>
        </div>
      </div>
      <div className="ice-stage">
        <canvas ref={canvas} className="ice-canvas" aria-hidden="true" data-logos={logos} />
        <button type="button" className="ice-view-btn" aria-label={view === "follow" ? "Show the whole rink" : "Show the close-up that follows the Zamboni"} onClick={() => setView(view === "follow" ? "overview" : "follow")}>
          <span aria-hidden="true">{view === "follow" ? "⤢ Full rink" : "⌖ Close-up"}</span>
        </button>
      </div>
      <p className="int-cap" ref={capRef}><span className="int-who"><TeamLogo id={away.id} size={44} /><b>{away.short} at {home.short}</b></span><i className="int-sep" aria-hidden="true" />{` ${initial.cap}`}</p>
    </section>
  );
}

/** For an upcoming game: nothing until the ice-preparation window opens (20 minutes before puck drop), then the Zamboni preparing the ice, until the game starts. */
export function IcePrep({ game, home, away, compact = false }: { game: Game; home: Team; away: Team; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  if (!icePrepActive(game, now)) return null;
  return <IntermissionRink game={game} home={home} away={away} compact={compact} mode="pregame" />;
}

export { FINISH_LEFT };
