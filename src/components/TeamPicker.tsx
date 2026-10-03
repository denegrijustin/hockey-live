import type { Team } from "../types";
export function TeamPicker({
  teams,
  selected,
  onChange,
}: {
  teams: Team[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="team-picker">
      <div className="quick-teams">
        {["EDM", "CHI", "MIN"].map((id) => (
          <button
            key={id}
            className="team-pill"
            aria-pressed={selected.includes(id)}
            title={`Show ${teams.find((team) => team.id === id)?.name ?? id} only`}
            onClick={() => onChange([id])}
          >
            <img
              src={`/logos/${id}.svg`}
              alt=""
              width="25"
              height="25"
              decoding="async"
            />
            {id}
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => onChange(["EDM", "CHI", "MIN"])}
        >
          My three
        </button>
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
            <strong>Your teams</strong>
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
              <img
                src={`/logos/${t.id}.svg`}
                alt=""
                width="24"
                height="24"
                loading="lazy"
                decoding="async"
              />
              {t.name}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
