import type { Team, Game } from "../types";
export function TeamSummary({
  team,
  standing,
  baseline,
  games,
}: {
  team: Team;
  standing: any;
  baseline?: any;
  games: Game[];
}) {
  const next = games
    .filter(
      (g) =>
        !["OFF", "FINAL"].includes(g.state) &&
        (g.home === team.id || g.away === team.id) &&
        g.type === 2,
    )
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const showing = standing.gp ? standing : baseline;
  return (
    <article
      className="team-summary"
      style={{ "--team-color": team.color } as React.CSSProperties}
    >
      <div className="summary-top">
        <img src={`/logos/${team.id}.svg`} alt="" />
        <div>
          <span className="eyebrow">{team.division}</span>
          <h3>
            {team.city}
            <strong>{team.short}</strong>
          </h3>
        </div>
        <span className="team-code">{team.id}</span>
      </div>
      <div className="summary-stats">
        <div>
          <strong>{standing.gp ? standing.pts : "0"}</strong>
          <span>POINTS</span>
        </div>
        <div>
          <strong>
            {standing.w}–{standing.l}–{standing.ot}
          </strong>
          <span>W–L–OT</span>
        </div>
        <div>
          <strong>
            {standing.gp
              ? ((standing.pts / (standing.gp * 2)) * 100).toFixed(1) + "%"
              : "—"}
          </strong>
          <span>POINTS %</span>
        </div>
      </div>
      <div className="team-summary-footer">
        {next ? (
          <>
            <span>
              NEXT ·{" "}
              {new Date(next.start).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
            <strong>
              {next.home === team.id ? "vs" : "@"}{" "}
              {next.home === team.id ? next.away : next.home}
            </strong>
          </>
        ) : (
          <span>Regular-season schedule completed</span>
        )}
      </div>
      {!standing.gp && showing?.gp > 0 && (
        <p className="baseline-note">
          Previous season: {showing.pts} pts · {showing.w}–{showing.l}–
          {showing.ot}
        </p>
      )}
    </article>
  );
}
