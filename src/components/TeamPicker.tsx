import type { Team } from "../types";
import { useFavorites } from "../hooks/useFavorites";
import { TeamLogo } from "./TeamLogo";
export function TeamPicker({
  teams,
  selected,
  onChange,
}: {
  teams: Team[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { favorites: mine } = useFavorites();
  return (
    <div className="team-picker">
      <div className="quick-teams">
        {mine.slice(0, 6).map((id) => (
          <button
            key={id}
            className="team-pill"
            aria-pressed={selected.includes(id)}
            title={`Show ${teams.find((team) => team.id === id)?.name ?? id} only`}
            onClick={() => onChange([id])}
          >
            <TeamLogo id={id} size={25} />
            {id}
          </button>
        ))}
        {mine.length > 0 && (
          <button
            className="text-button"
            aria-pressed={selected.length === mine.length && mine.every((id) => selected.includes(id))}
            onClick={() => onChange(mine)}
          >
            My teams
          </button>
        )}
        <button
          className="text-button"
          aria-pressed={selected.length === teams.length}
          onClick={() => onChange(teams.map((t) => t.id))}
        >
          All 32
        </button>
      </div>
      <details className="team-menu">
        <summary>
          Choose teams <span>{selected.length}</span>
          <b>⌄</b>
        </summary>
        <div className="team-options">
          <div className="team-options-heading">
            <strong>Teams</strong>
            <button onClick={() => onChange([])}>Clear</button>
          </div>
          {teams.map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={() =>
                  onChange(
                    selected.includes(t.id)
                      ? selected.filter((x) => x !== t.id)
                      : [...selected, t.id],
                  )
                }
              />
              <TeamLogo id={t.id} size={24} />
              {t.name}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
