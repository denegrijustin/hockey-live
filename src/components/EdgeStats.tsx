import { useEffect, useState } from "react";
import type { EdgeData, Team } from "../types";
import { useVisible } from "./GameData";
const pending = new Map<string, Promise<EdgeData>>();
const fetchedAt = new Map<string, number>();
function loadEdge(season: number, team: string) {
  const key = `${season}/${team}`;
  if (Date.now() - (fetchedAt.get(key) ?? 0) > 300000) {
    pending.delete(key);
    fetchedAt.set(key, Date.now());
  }
  if (!pending.has(key))
    pending.set(
      key,
      fetch(`/api/edge/${key}`)
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .catch(async () => {
          const r = await fetch(`/data/edge/${key}.json`);
          if (!r.ok || !r.headers.get("content-type")?.includes("json"))
            throw Error();
          return r.json();
        })
        .catch((e) => {
          pending.delete(key);
          throw e;
        }),
    );
  return pending.get(key)!;
}
export function EdgeStats({ team, season }: { team: Team; season: number }) {
  const { ref, visible } = useVisible(),
    [data, setData] = useState<EdgeData | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setData(null);
    setError(false);
  }, [team.id, season]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError(false);
    const refresh = () => loadEdge(season, team.id)
      .then((d) => {
        if (d.season !== season || !Array.isArray(d.metrics)) throw Error("Selected season not published");
        if (active) { setData(d); setError(false); }
      })
      .catch(() => {
        if (active) { setData(null); setError(true); }
      });
    refresh();
    const timer = setInterval(refresh, 300000);
    return () => { active = false; clearInterval(timer); };
  }, [visible, team.id, season, retry]);
  return (
    <div ref={ref} className="edge-card">
      <div className="edge-heading">
        <img src={`/logos/${team.id}.svg`} alt="" />
        <div>
          <p className="eyebrow">NHL EDGE</p>
          <h3>{team.name}</h3>
        </div>
      </div>
      {!data ? (
        <p className="detail-note">
          {error ? (
            <>
              Selected-season EDGE data is not published or is temporarily unavailable. No previous-season totals are substituted.{" "}
              <button onClick={() => setRetry((x) => x + 1)}>Retry</button>
            </>
          ) : (
            "Loading tracking statistics…"
          )}
        </p>
      ) : (
        <>
          <p className="detail-note">
            {String(data.season).slice(0, 4)}–{String(data.season).slice(6)}{" "}
            regular season · {data.gamesPlayed} GP
            {data.season !== season
              ? " · Previous-season context; current EDGE data not published yet."
              : ""}
          </p>
          <div className="edge-metrics">
            {data.metrics.map((m) => (
              <div className="edge-metric" key={m.key}>
                <span>{m.label}</span>
                <div>
                  <strong>
                    {m.value.toLocaleString("en-US", {
                      maximumFractionDigits: m.unit === "bursts" ? 0 : 1,
                    })}
                  </strong>{" "}
                  <small>{m.unit}</small>
                  <b>#{m.rank ?? "—"}</b>
                </div>
                <div className="edge-bar">
                  <i
                    style={{
                      width: `${(m.value / Math.max(m.value, m.average ?? 0)) * 90}%`,
                      background: team.color,
                    }}
                  />
                  {m.average !== null && (
                    <span
                      style={{
                        left: `${(m.average / Math.max(m.value, m.average)) * 90}%`,
                      }}
                    />
                  )}
                </div>
                <small>
                  League avg{" "}
                  {m.average?.toLocaleString("en-US", {
                    maximumFractionDigits: 1,
                  }) ?? "—"}
                </small>
              </div>
            ))}
          </div>
          <h4>Puck zone time</h4>
          <div className="zone-bar">
            {data.zones.map((z, i) => (
              <span
                key={z.label}
                style={{
                  width: `${z.value * 100}%`,
                  background: ["#69cbb6", "#677f8d", "#cc8794"][i],
                }}
                title={`${z.label}: ${(z.value * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="zone-labels">
            {data.zones.map((z) => (
              <span key={z.label}>
                {z.label}
                <b>{(z.value * 100).toFixed(1)}%</b>
                <small>Avg {(z.average * 100).toFixed(1)}%</small>
              </span>
            ))}
          </div>
          <h4>Shots by danger / distance</h4>
          {data.locations.map((l) => (
            <div className="location-row" key={l.label}>
              <span>{l.label}</span>
              <div>
                <i
                  style={{
                    width: `${(l.shots / Math.max(1, ...data.locations.map((x) => x.shots))) * 100}%`,
                    background: team.color,
                  }}
                />
              </div>
              <b>{l.shots}</b>
              <small>{l.goals} G</small>
            </div>
          ))}
          <p className="detail-note">
            Retrieved {new Date(data.updatedAt).toLocaleString()}. Tracking
            season totals, not a live tracking feed. Team ranks and league
            averages are supplied by NHL EDGE.
          </p>
          <a
            href="https://www.nhl.com/nhl-edge"
            target="_blank"
            rel="noreferrer"
          >
            NHL EDGE source ↗
          </a>
        </>
      )}
    </div>
  );
}
export function EdgePanel({
  teams,
  season,
}: {
  teams: Team[];
  season: number;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PUCK & PLAYER TRACKING</p>
          <h2>NHL EDGE</h2>
          <p>
            Speed, distance, shot location and zone time. Compare each team with
            the league.
          </p>
        </div>
      </div>
      <div className="edge-grid">
        {teams.map((team) => (
          <EdgeStats team={team} season={season} key={team.id} />
        ))}
      </div>
      {!teams.length && <p>Select a team above.</p>}
    </section>
  );
}
