import { useMemo } from "react";
import type { Game, Team } from "../types";
import { useFeed } from "../lib/polling";
import { buildResumes } from "../lib/resumes.mjs";
import { teamGames, sideOf } from "../lib/team-schedule.mjs";
import { Chip } from "./Resumes";
import { TeamLogo } from "./TeamLogo";
import "./team-profile.css";

const DIV_FILE: Record<string, string> = { Atlantic: "atlantic", Metropolitan: "metro", Central: "central", Pacific: "pacific" };
type Item = ReturnType<typeof sideOf>;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function TeamProfileBody({ team, teams, table, games, season, onClose }: { team: Team; teams: Team[]; table: Record<string, any>; games: Game[]; season: number; onClose: () => void }) {
  const row = useMemo(() => (buildResumes({ teams, table, games }) as any[]).find((r) => r.team === team.id), [teams, table, games, team.id]);
  const items: Item[] = useMemo(() => teamGames(games, team.id).map((g: Game) => sideOf(g, team.id)), [games, team.id]);
  const recent = items.filter((i) => i.status === "final").slice(-5).reverse();
  const next = items.filter((i) => i.status !== "final").slice(0, 3);
  const { data: inj } = useFeed<any>(`/api/injuries/${season}`, 600_000);
  const hurt = (inj?.items ?? []).filter((i: any) => i.team === team.id).slice(0, 6);
  const t = table[team.id];
  return (
    <>
      <div className="tp-head">
        <TeamLogo id={team.id} size={72} />
        <div>
          <h2>{team.name}</h2>
          <p className="tp-sub">
            <img src={`/logos/league/${team.conference === "E" ? "east" : "west"}.webp`} alt={team.conference === "E" ? "Eastern Conference" : "Western Conference"} width="48" height="35" />
            <img src={`/logos/league/${DIV_FILE[team.division] ?? "atlantic"}.webp`} alt={`${team.division} Division`} width="40" height="26" />
          </p>
          {t && <p className="tp-rec"><b>{t.w}–{t.l}–{t.ot}</b> · {t.pts} pts{row ? <> · <b>#{row.rank}</b> in the league</> : null}</p>}
        </div>
        <button type="button" className="dialog-close tp-close" onClick={onClose} aria-label="Close team profile">Close ×</button>
      </div>
      {row && (
        <div className="tp-ranks" aria-label="Rankings">
          {([["SOS", row.sos, "Schedule strength"], ["OFF", row.off, "Goals per game"], ["DEF", row.def, "Goals against per game"]] as const).map(([k, v, tip]) => (
            <span key={k} title={`${tip}: ranked ${v.rank} of ${teams.length}`}><small>{k}</small><b>{v.rank}</b><i>{k === "SOS" ? "" : v.value.toFixed(1)}</i></span>
          ))}
        </div>
      )}
      {row && (
        <div className="tp-grid">
          <section><h3>Best wins</h3>{row.bestWins.length ? <ul className="tp-chips">{row.bestWins.map((m: any) => <Chip key={m.id} m={m} win />)}</ul> : <p className="rs-none">No wins yet</p>}</section>
          <section><h3>Losses</h3>{row.lossCount ? <ul className="tp-chips">{row.losses.map((m: any) => <Chip key={m.id} m={m} win={false} />)}{row.moreLosses > 0 && <li className="rs-more">+{row.moreLosses} more</li>}</ul> : <p className="rs-none">Unbeaten</p>}</section>
        </div>
      )}
      <div className="tp-grid">
        <section>
          <h3>Recent results</h3>
          {recent.length ? <ul className="tp-list">{recent.map((i) => (
            <li key={i.id} className={`r-${i.result ?? ""}`}><b>{i.result ?? "–"}</b><span>{i.home ? "vs" : "at"}</span><TeamLogo id={i.opp} size={20} /><span>{i.opp}</span><em>{i.us}–{i.them}{i.ot ? ` ${i.ot}` : ""}</em></li>
          ))}</ul> : <p className="rs-none">No games played yet</p>}
        </section>
        <section>
          <h3>Coming up</h3>
          {next.length ? <ul className="tp-list">{next.map((i) => (
            <li key={i.id}><span>{i.home ? "vs" : "at"}</span><TeamLogo id={i.opp} size={20} /><span>{i.opp}</span><em>{i.status === "live" ? "Live now" : when(i.start)}</em></li>
          ))}</ul> : <p className="rs-none">Nothing scheduled</p>}
        </section>
      </div>
      <section>
        <h3>Injuries</h3>
        {hurt.length ? <ul className="tp-inj">{hurt.map((i: any) => <li key={i.id}><b>{i.name}</b>{i.pos ? <small> {i.pos}</small> : null}<span className={`gi-sev ${i.severity.level}`}>{i.severity.label}</span><em>{i.kind} · {i.back.text}</em></li>)}</ul> : <p className="rs-none">{inj ? "No injuries reported" : "Loading the injury report…"}</p>}
      </section>
    </>
  );
}

