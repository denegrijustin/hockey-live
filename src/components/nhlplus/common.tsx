import { useState } from "react";
import rawTeams from "../../data/teams.json";
import type { Team } from "../../types";
import { SIT_FILTERS, SIT_LABEL } from "../../lib/nhlplus.mjs";
import type { Sit } from "../../lib/moneypuck-types";
import { MetricTip } from "./shared/MetricTip";
import { DEFAULT_MIN, MIN_CHOICES, effectiveMin } from "./state";
import type { Sort } from "./state";

export const TEAMS: Team[] = rawTeams;
export const TEAM_BY_ID: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export const teamName = (id: string) => TEAM_BY_ID[id]?.name ?? id;

export function Logo({ team, size = 22 }: { team: string; size?: number }) {
  return <img className="np-logo" src={`/logos/${team}.svg`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

const initials = (name: string) => name.split(/[\s-]+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join("");
/** Player face from the NHL image host, initials when it is missing or fails. */
export function Face({ id, team, name, season, size = 32 }: { id: number; team: string; name: string; season: number; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="np-face np-face-fallback" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
  return <img className="np-face" src={`https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function SitFilter({ sit, onChange, label = "Situation" }: { sit: Sit; onChange: (s: Sit) => void; label?: string }) {
  return (
    <div className="np-field">
      <span className="np-field-label"><MetricTip id="situation">{label}</MetricTip></span>
      <div className="segmented np-seg" role="group" aria-label={label}>
        {(SIT_FILTERS as Sit[]).map((s) => <button key={s} type="button" aria-pressed={sit === s} onClick={() => onChange(s)}>{SIT_LABEL[s]}</button>)}
      </div>
    </div>
  );
}

export function MinFilter({ kind, sit, value, onChange, label = "Min. time on ice" }: { kind: keyof typeof DEFAULT_MIN; sit: string; value: number | null; onChange: (v: number | null) => void; label?: string }) {
  const def = DEFAULT_MIN[kind][sit] ?? 0;
  return (
    <label className="np-field">
      <span className="np-field-label">{label}</span>
      <select aria-label={label} value={value == null ? "auto" : String(value)} onChange={(e) => onChange(e.target.value === "auto" ? null : +e.target.value)}>
        <option value="auto">{def ? `${def} min (default)` : "Any (default)"}</option>
        {MIN_CHOICES.filter((m) => m !== def).map((m) => <option key={m} value={m}>{m ? `${m} min` : "Any"}</option>)}
      </select>
    </label>
  );
}
export { effectiveMin };

export function TeamSelect({ value, onChange, label, all = false, allLabel = "All teams" }: { value: string; onChange: (v: string) => void; label: string; all?: boolean; allLabel?: string }) {
  return (
    <label className="np-field">
      <span className="np-field-label">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="all">{allLabel}</option>}
        {[...TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}

/** A sortable column header: the whole label is one button, and aria-sort tells assistive tech the state. */
export function SortTh({ col, label, tip, sort, onSort, className = "", title, firstDir = "desc", rowSpan }: { rowSpan?: number; col: string; label: string; tip?: string; sort: Sort; onSort: (key: string, firstDir: "asc" | "desc") => void; className?: string; title?: string; firstDir?: "asc" | "desc" }) {
  const active = sort.key === col;
  return (
    <th scope="col" rowSpan={rowSpan} className={`np-th ${className}`.trim()} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} title={title}>
      <span className="np-th-in">
        <button type="button" className="np-sortbtn" onClick={() => onSort(col, firstDir)}>{label}<i aria-hidden="true">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</i></button>
        {tip && <MetricTip id={tip} />}
      </span>
    </th>
  );
}

export function Panel({ title, sub, children, actions, id }: { title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section className="np-panel" aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="np-panel-head">
        <div><h3 id={id ? `${id}-h` : undefined}>{title}</h3>{sub && <p>{sub}</p>}</div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Unavailable({ what, onRetry }: { what: string; onRetry?: () => void }) {
  return <div className="np-empty" role="status">{what} is not available right now.{onRetry && <> <button type="button" className="mp-link" onClick={onRetry}>Retry</button></>}</div>;
}
export const Loading = ({ what }: { what: string }) => <div className="np-empty" role="status">Loading {what}…</div>;

/** Small chip for "derived" calculations. */
export const Derived = () => <span className="np-derived" title="Calculated here from MoneyPuck values">derived</span>;
