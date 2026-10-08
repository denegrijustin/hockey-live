import { useEffect, useState } from "react";
import type { EdgeData, Team } from "../types";
import { loadEdge } from "./EdgeStats";
import { useVisible } from "./GameData";
import { rankLine, rankTitle } from "../lib/ranks.mjs";
import "./team-comparison.css";

type Row = {
  key: string;
  label: string;
  a: number | null;
  h: number | null;
  aText: string;
  hText: string;
  aSub?: string;
  hSub?: string;
  /** true when a larger number is better */
  higher: boolean;
  bars: boolean;
  /** Optional bar-length values (0..1); default scales raw values */
  aBar?: number | null;
  hBar?: number | null;
};
const num = (n: number | null, d = 1) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const signedNum = (n: number) => (n > 0 ? `+${n}` : String(n));

function useEdge(team: Team, season: number, enabled: boolean) {
  const [data, setData] = useState<EdgeData | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setData(null);
    setError(false);
    const refresh = () =>
      loadEdge(season, team.id)
        .then((d) => {
          if (d.season > season || !Array.isArray(d.metrics)) throw Error();
          if (active) {
            setData(d);
            setError(false);
          }
        })
        .catch(() => {
          if (active) {
            setData(null);
            setError(true);
          }
        });
    refresh();
    const timer = setInterval(refresh, 300000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, team.id, season]);
  return { data, error };
}

export function buildRows({
  away,
  home,
  table,
  ranks,
  awayEdge,
  homeEdge,
}: {
  away: Team;
  home: Team;
  table: any;
  ranks: any;
  awayEdge: EdgeData | null;
  homeEdge: EdgeData | null;
}): Row[] {
  const rows: Row[] = [];
  const A = table?.[away.id],
    H = table?.[home.id];
  if (A && H) {
    const pct = (r: any) => (r.gp ? r.pts / (2 * r.gp) : null);
    const per = (r: any, k: string) => (r.gp ? r[k] / r.gp : null);
    rows.push({
      key: "record",
      label: "Record (W–L–OT)",
      a: pct(A),
      h: pct(H),
      aText: `${A.w}–${A.l}–${A.ot}`,
      hText: `${H.w}–${H.l}–${H.ot}`,
      aSub: `${A.pts} pts · ${A.gp} GP`,
      hSub: `${H.pts} pts · ${H.gp} GP`,
      higher: true,
      bars: false,
    });
    rows.push({
      key: "pct",
      label: "Points %",
      a: pct(A),
      h: pct(H),
      aText: A.gp ? `${(pct(A)! * 100).toFixed(1)}%` : "—",
      hText: H.gp ? `${(pct(H)! * 100).toFixed(1)}%` : "—",
      higher: true,
      bars: true,
    });
    rows.push({
      key: "gf",
      label: "Goals for / game",
      a: per(A, "gf"),
      h: per(H, "gf"),
      aText: num(per(A, "gf"), 2),
      hText: num(per(H, "gf"), 2),
      higher: true,
      bars: true,
    });
    rows.push({
      key: "ga",
      label: "Goals against / game",
      a: per(A, "ga"),
      h: per(H, "ga"),
      aText: num(per(A, "ga"), 2),
      hText: num(per(H, "ga"), 2),
      higher: false,
      bars: true,
    });
    const gd = (r: any) => (r.gp ? r.gf - r.ga : null);
    rows.push({
      key: "gd",
      label: "Goal differential",
      a: gd(A),
      h: gd(H),
      aText: gd(A) == null ? "—" : signedNum(gd(A)!),
      hText: gd(H) == null ? "—" : signedNum(gd(H)!),
      higher: true,
      bars: true,
    });
  }
  const ar = ranks?.[away.id],
    hr = ranks?.[home.id];
  if (ar && hr) {
    for (const [k, label, size] of [
      ["division", "Division rank", "divisionSize"],
      ["conference", "Conference rank", "conferenceSize"],
      ["league", "League rank", "leagueSize"],
    ] as const)
      rows.push({
        key: `rank-${k}`,
        label,
        a: ar[k],
        h: hr[k],
        aText: `#${ar[k]}`,
        hText: `#${hr[k]}`,
        aSub: `of ${ar[size]}`,
        hSub: `of ${hr[size]}`,
        higher: false,
        bars: true,
        aBar: (ar[size] + 1 - ar[k]) / ar[size],
        hBar: (hr[size] + 1 - hr[k]) / hr[size],
      });
  }
  if (awayEdge && homeEdge)
    for (const m of awayEdge.metrics) {
      const o = homeEdge.metrics.find((x) => x.key === m.key);
      if (!o) continue;
      const d = m.unit === "bursts" ? 0 : 1;
      const useRank = m.rank != null && o.rank != null && m.rank !== o.rank;
      rows.push({
        key: `edge-${m.key}`,
        label: m.label,
        a: useRank ? m.rank : m.value,
        h: useRank ? o.rank : o.value,
        aText: num(m.value, d),
        hText: num(o.value, d),
        aSub: [m.unit, m.rank != null ? `#${m.rank}` : ""].filter(Boolean).join(" · "),
        hSub: [o.unit, o.rank != null ? `#${o.rank}` : ""].filter(Boolean).join(" · "),
        higher: !useRank,
        bars: true,
        aBar: m.value,
        hBar: o.value,
      });
    }
  return rows;
}

function colors(away: Team, home: Team) {
  const a = away.cardColor ?? away.color,
    h = home.cardColor ?? home.color;
  return [a.toLowerCase() === h.toLowerCase() ? "#e9c882" : a, h] as const;
}

export function TeamComparison({
  away,
  home,
  season,
  table,
  ranks,
  title = "Team comparison",
}: {
  away: Team;
  home: Team;
  season: number;
  table: any;
  ranks: any;
  title?: string;
}) {
  const { ref, visible } = useVisible(),
    ae = useEdge(away, season, visible),
    he = useEdge(home, season, visible),
    [ac, hc] = colors(away, home),
    rows = buildRows({ away, home, table, ranks, awayEdge: ae.data, homeEdge: he.data }),
    edgeSeason = ae.data && he.data && ae.data.season !== season ? ae.data.season : null;
  return (
    <div ref={ref} className="cmp" aria-label={`${away.name} versus ${home.name} comparison`}>
      <div className="cmp-head">
        {[away, home].map((t, i) => (
          <div className={`cmp-team ${i ? "cmp-home" : "cmp-away"}`} key={t.id}>
            <img src={`/logos/${t.id}.svg`} alt="" width={36} height={36} />
            <div>
              <strong>{t.short}</strong>
              <small>{i ? "HOME" : "AWAY"}</small>
              {ranks?.[t.id] && (
                <small className="cmp-rank" title={rankTitle(ranks[t.id])}>
                  {rankLine(ranks[t.id], true)}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="cmp-note">{title}. Better side highlighted. Ranks are by points %.</p>
      {rows.map((r) => {
        const aBetter =
          r.a == null || r.h == null || r.a === r.h ? null : r.higher ? r.a > r.h : r.a < r.h;
        const ab = r.aBar ?? r.a,
          hb = r.hBar ?? r.h,
          mx = Math.max(Math.abs(ab ?? 0), Math.abs(hb ?? 0)) || 1;
        const w = (v: number | null | undefined) => `${Math.min(100, (Math.abs(v ?? 0) / mx) * 100)}%`;
        return (
          <div className="cmp-row" key={r.key} data-metric={r.key}>
            <div className={`cmp-val cmp-val-a ${aBetter === true ? "cmp-better" : ""}`}>
              <b>{r.aText}</b>
              {r.aSub && <small>{r.aSub}</small>}
            </div>
            <span className="cmp-label">{r.label}</span>
            <div className={`cmp-val cmp-val-h ${aBetter === false ? "cmp-better" : ""}`}>
              <b>{r.hText}</b>
              {r.hSub && <small>{r.hSub}</small>}
            </div>
            {r.bars && (
              <div className="cmp-bars" aria-hidden="true">
                <div className="cmp-half cmp-half-a">
                  <i style={{ width: w(ab), background: aBetter === false ? undefined : ac }} className={aBetter === false ? "cmp-dim" : ""} />
                </div>
                <div className="cmp-half cmp-half-h">
                  <i style={{ width: w(hb), background: aBetter === true ? undefined : hc }} className={aBetter === true ? "cmp-dim" : ""} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {(ae.error || he.error) && (
        <p className="cmp-note">NHL EDGE tracking rows are temporarily unavailable.</p>
      )}
      {!ae.data && !he.data && !ae.error && !he.error && visible && (
        <p className="cmp-note">Loading NHL EDGE tracking…</p>
      )}
      {edgeSeason && (
        <p className="cmp-note">
          EDGE rows show {String(edgeSeason).slice(0, 4)}–{String(edgeSeason).slice(6)} totals; the current season is not yet published.
        </p>
      )}
      {ae.data && (
        <p className="cmp-note">
          EDGE: season totals from NHL EDGE; where both ranks are published the better rank wins.{" "}
          <a href="https://www.nhl.com/nhl-edge" target="_blank" rel="noreferrer">NHL EDGE ↗</a>
        </p>
      )}
    </div>
  );
}
