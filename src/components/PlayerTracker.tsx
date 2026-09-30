import { PlayerIdentity } from "./PlayerIdentity";
import { usePlayerBox } from "./PlayerImpact";
import { skaterImpact, goalieImpact, signed } from "../lib/model.mjs";
import type { Boxscore, Game, PlayerData, Team } from "../types";
// Season-context TOI (PlayerSeason.toi) comes through as average seconds on
// ice per game; boxscore TOI (Player.toi) is already an "mm:ss" string from
// the NHL feed. Normalize both to the same display so the two team columns
// read the same whichever source is backing them.
function toiLabel(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function PlayerTracker({
  game,
  home,
  away,
  sourceSeason,
}: {
  game: Game;
  home: Team;
  away: Team;
  sourceSeason: number;
}) {
  const { data, context, error, live, retry } = usePlayerBox(game, sourceSeason);
  if (error && !data)
    return (
      <div className="inline-error">
        {error} <button onClick={retry}>Retry</button>
      </div>
    );
  if (!data && !context.length)
    return (
      <p className="loading" role="status">
        Loading player tracker…
      </p>
    );
  return (
    <div className="player-tracker">
      <div className="mini-heading">
        PLAYER TRACKER
        <span>
          {data
            ? live
              ? "Live box score · updates every 30s"
              : "Final box score"
            : `${String(sourceSeason).slice(0, 4)}–${String(sourceSeason).slice(6)} season context`}
        </span>
      </div>
      <p className="detail-note">
        {data
          ? "Ice time and box-score index, ranked within each team."
          : "No box score yet — ranked by each team's regular-season contributors instead."}
      </p>
      <div className="tracker-grid">
        <TeamTracker team={away} data={data} context={context[0]} />
        <TeamTracker team={home} data={data} context={context[1]} />
      </div>
    </div>
  );
}
function TeamTracker({
  team,
  data,
  context,
}: {
  team: Team;
  data: Boxscore | null;
  context?: PlayerData;
}) {
  const live = data
    ? data.players
        .filter((p) => p.team === team.id && p.position !== "G")
        .sort((a, b) => skaterImpact(b) - skaterImpact(a))
        .map((p) => ({ p, score: skaterImpact(p), toi: p.toi, gp: null as number | null }))
    : [...(context?.skaters ?? [])]
        .filter((p) => p.gp >= 1)
        .sort((a, b) => skaterImpact(b) / b.gp - skaterImpact(a) / a.gp)
        .map((p) => ({ p, score: skaterImpact(p) / p.gp, toi: toiLabel(p.toi), gp: p.gp }));
  const top = live.filter((r) => r.score > 0).slice(0, 3);
  const bottom = [...live]
    .reverse()
    .filter((r) => r.score < 0)
    .slice(0, 3);
  const goalies = data
    ? data.players.filter(
        (p) => p.team === team.id && p.position === "G" && goalieImpact(p) != null,
      )
    : (context?.goalies ?? []).filter((p) => p.savePct != null);
  return (
    <div className="tracker-team">
      <div className="tracker-team-head">
        <img src={`/logos/${team.id}.svg`} alt="" width={26} height={26} loading="lazy" />
        <h4>{team.name}</h4>
      </div>
      {!live.length ? (
        <p className="detail-note">No skater data published yet.</p>
      ) : (
        <>
          <p className="tracker-label">Top performers</p>
          {top.length ? (
            <div className="impact-list">
              {top.map((r) => (
                <TrackerRow key={r.p.id} r={r} />
              ))}
            </div>
          ) : (
            <p className="detail-note">No skater has a positive index yet.</p>
          )}
          {bottom.length > 0 && (
            <>
              <p className="tracker-label">Struggling</p>
              <div className="impact-list">
                {bottom.map((r) => (
                  <TrackerRow key={r.p.id} r={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {goalies.length > 0 && (
        <>
          <p className="tracker-label">Goalies</p>
          {goalies.map((p) => (
            <div className="goalie-line" key={p.id}>
              <span>
                <PlayerIdentity p={p} /> {p.saves}/{p.shotsAgainst} saves
              </span>
              <b className={goalieImpact(p)! >= 0 ? "positive" : "negative"}>
                {signed(goalieImpact(p)!, 2)}
              </b>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
function TrackerRow({
  r,
}: {
  r: { p: any; score: number; toi: string; gp: number | null };
}) {
  return (
    <div className="impact-row">
      <div>
        <PlayerIdentity p={r.p} />
        <small>
          {r.gp != null ? `${r.gp} GP · ` : ""}
          {r.p.goals} G · {r.p.assists} A · {r.toi} TOI{r.gp != null ? "/gm" : ""} ·{" "}
          {r.p.hits ?? "—"} hits
        </small>
      </div>
      <b className={r.score >= 0 ? "positive" : "negative"}>
        {signed(r.score, 2)}
        {r.gp != null && <small>/game</small>}
      </b>
    </div>
  );
}
