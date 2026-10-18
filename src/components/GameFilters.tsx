import type { Game } from "../types";
import { finished } from "../lib/model.mjs";

/** Upcoming / Past, with counts. Used in the desktop toolbar and in the phone Filters sheet. */
export function PeriodSwitch({ period, setPeriod, relevant, type }: { period: string; setPeriod: (p: string) => void; relevant: Game[]; type: number }) {
  const count = (past: boolean) => relevant.filter((g) => g.type === type && finished(g) === past).length;
  return (
    <div className="segmented" role="group" aria-label="Game period">
      <button aria-pressed={period === "future"} onClick={() => setPeriod("future")}>
        Upcoming <span>{count(false)}</span>
      </button>
      <button aria-pressed={period === "past"} onClick={() => setPeriod("past")}>
        Past games <span>{count(true)}</span>
      </button>
    </div>
  );
}

interface FieldProps {
  type: number;
  setType: (n: number) => void;
  range: string;
  setRange: (r: string) => void;
  sort: string;
  setSort: (s: string) => void;
  query: string;
  setQuery: (q: string) => void;
  /** The matchup search sits in the phone control row, so the sheet leaves it out. */
  showSearch?: boolean;
}

/** The game list filters. The same fields appear in the desktop panel and in the phone sheet. */
export function GameFilterFields({ type, setType, range, setRange, sort, setSort, query, setQuery, showSearch = true }: FieldProps) {
  return (
    <>
      <label>
        Competition
        <select value={type} onChange={(e) => setType(+e.target.value)}>
          <option value={2}>Regular season</option>
          <option value={1}>Preseason</option>
          <option value={3}>Playoffs</option>
        </select>
      </label>
      <label>
        Window
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Within 7 days of today</option>
          <option value="30">Within 30 days of today</option>
          <option value="all">Entire season</option>
        </select>
      </label>
      <label>
        Sort by
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">Game date (chronological)</option>
          <option value="importance">Importance to teams + league</option>
        </select>
      </label>
      {showSearch && (
        <label className="game-search">
          Find a matchup
          <input type="search" placeholder="Team or opponent…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
    </>
  );
}
