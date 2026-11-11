import { useId, useState, type ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { Sheet } from "../Sheet";
import { TeamLogo } from "../TeamLogo";
import { Methodology } from "../Methodology";
import { VIEW_LIST } from "../MainNav";
import { AlertSettings } from "../alerts/AlertSettings";
import { InstallCard } from "../InstallCard";
import { prefsPersisted, resetPrefs, setPrefs, usePrefs, type Prefs } from "../../lib/prefs";
import { fmtTime } from "../../lib/dates.mjs";
import teamsJson from "../../data/teams.json";
import pkg from "../../../package.json";
import "./settings.css";

type Team = { id: string; name: string };
const TEAMS = teamsJson as Team[];
const nameOf = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;
type Display = Prefs["display"];

const ZONES: [string, string][] = [
  ["auto", "This device"], ["ET", "Eastern (NHL hockey day)"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Los_Angeles", "Pacific"], ["America/Halifax", "Atlantic"], ["Europe/London", "London"], ["Europe/Stockholm", "Central Europe"], ["UTC", "UTC"],
];

/** A radio group drawn as a row of pill buttons: native radios, so arrows and screen readers work without extra code. */
function Choice<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset className="st-field">
      <legend>{label}</legend>
      <div className="st-pills">
        {options.map(([v, text]) => (
          <label key={v} className="st-pill">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
      {hint && <p className="st-hint">{hint}</p>}
    </fieldset>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="st-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="st-section" aria-labelledby={`st-${id}`} data-testid={`settings-${id}`}>
      <h2 id={`st-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

function TeamPicker({ selected, onChange, onClose }: { selected: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = f ? TEAMS.filter((t) => `${t.name} ${t.id}`.toLowerCase().includes(f)) : TEAMS;
  return (
    <Sheet title="Favorite teams" onClose={onClose}>
      <input className="st-search" type="search" aria-label="Find a team" placeholder="Find a team" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="st-teamlist">
        {shown.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => onChange(selected.includes(t.id) ? selected.filter((x) => x !== t.id) : [...selected, t.id])} />
              <TeamLogo id={t.id} size={28} />
              <span>{t.name}</span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="st-none">No team matches “{q}”.</li>}
      </ul>
    </Sheet>
  );
}

const link = (q: string) => `${location.pathname}?${q}`;

/** Settings: My NHL, Display, Notifications, Application. Everything here is stored on this device only. */
export function Settings() {
  const prefs = usePrefs();
  const d = prefs.display;
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const setD = <K extends keyof Display>(k: K, v: Display[K]) => setPrefs((p) => ({ ...p, display: { ...p.display, [k]: v } }));
  const setSection = (k: keyof Display["sections"], v: boolean) => setD("sections", { ...d.sections, [k]: v });
  const views = VIEW_LIST.filter((v) => v.id !== "settings");
  const sample = fmtTime("2026-11-10T00:00:00Z", {}, d);

  return (
    <section aria-label="Settings" className="settings">
      <PageHeader title="Settings" eyebrow="MY ICEBOARD" />
      <p className="st-device" role="note">Saved on this device only. No account, nothing is sent anywhere.</p>
      {!prefsPersisted() && (
        <p className="st-warn" role="alert">This browser is blocking storage, so your choices apply now but will be forgotten when you close the page.</p>
      )}

      <Section id="mynhl" title="My NHL">
        <h3>Favorite teams</h3>
        {prefs.favorites.length ? (
          <ul className="st-list">
            {prefs.favorites.map((id) => (
              <li key={id}>
                <TeamLogo id={id} size={28} />
                <a href={link(`view=teams&team=${id}`)}>{nameOf(id)}</a>
                <button type="button" className="st-btn" aria-label={`Remove ${nameOf(id)} from favorites`} onClick={() => setPrefs((p) => ({ ...p, favorites: p.favorites.filter((t) => t !== id) }))}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="st-hint">No favorite teams yet. Games and Home show the whole league.</p>}
        <button type="button" className="st-btn st-primary" onClick={() => setPicker(true)}>{prefs.favorites.length ? "Edit favorite teams" : "Add favorite teams"}</button>

        <h3>Followed players</h3>
        {prefs.players.length ? (
          <ul className="st-list">
            {prefs.players.map((pl) => (
              <li key={pl.id}>
                <a href={link(`view=players&player=${pl.id}`)}>{pl.name || `Player ${pl.id}`}</a>
                <span className="st-sub">{[pl.team, pl.pos].filter(Boolean).join(" · ")}</span>
                <button type="button" className="st-btn" aria-label={`Unfollow ${pl.name || pl.id}`} onClick={() => setPrefs((p) => ({ ...p, players: p.players.filter((x) => x.id !== pl.id) }))}>Unfollow</button>
              </li>
            ))}
          </ul>
        ) : <p className="st-hint">You are not following any players. Use Follow on a player page.</p>}

        <h3>Saved games</h3>
        {prefs.games.length ? (
          <ul className="st-list">
            {prefs.games.map((g) => (
              <li key={g.id}>
                <a href={g.date ? link(`date=${g.date}`) : link("view=scoreboard")}>{g.away && g.home ? `${g.away} at ${g.home}` : `Game ${g.id}`}</a>
                <span className="st-sub">{g.date}</span>
                <button type="button" className="st-btn" aria-label={`Remove saved game ${g.away} at ${g.home}`} onClick={() => setPrefs((p) => ({ ...p, games: p.games.filter((x) => x.id !== g.id) }))}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="st-hint">No saved games. Use Save on a game card.</p>}
      </Section>

      <Section id="display" title="Display">
        <Choice label="Theme" value={d.theme} onChange={(v) => setD("theme", v)} options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} />
        <Choice label="Contrast" value={d.contrast} onChange={(v) => setD("contrast", v)} options={[["system", "System"], ["more", "Higher"]]} />
        <Choice label="Motion" value={d.motion === "full" ? "system" : d.motion} onChange={(v) => setD("motion", v)} options={[["system", "System"], ["reduce", "Reduce"]]} hint="System follows your device's reduce-motion and data-saver settings." />
        <Choice label="Text size" value={d.textSize} onChange={(v) => setD("textSize", v)} options={[["s", "Small"], ["m", "Default"], ["l", "Large"], ["xl", "Largest"]]} />
        <label className="st-field st-select">
          <span>Time zone</span>
          <select value={ZONES.some(([z]) => z === d.timeZone) ? d.timeZone : "auto"} onChange={(e) => setD("timeZone", e.target.value)}>
            {ZONES.map(([z, t]) => <option key={z} value={z}>{t}</option>)}
          </select>
          <span className="st-hint">Game start times, e.g. 7:00 PM ET puck drop shows as {sample} here. Game days stay on the Eastern hockey day.</span>
        </label>
        <Choice label="Clock" value={d.hour12} onChange={(v) => setD("hour12", v)} options={[["auto", "Device"], ["12", "12-hour"], ["24", "24-hour"]]} />
        <Choice label="Cards" value={d.density} onChange={(v) => setD("density", v)} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
        <label className="st-field st-select">
          <span>Open Iceboard on</span>
          <select value={views.some((v) => v.id === d.defaultView) ? d.defaultView : "scoreboard"} onChange={(e) => setD("defaultView", e.target.value)}>
            {views.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <span className="st-hint">Used when you open the plain address, not a shared link.</span>
        </label>
        <Choice label="Home order" value={d.homeOrder} onChange={(v) => setD("homeOrder", v)} options={[["favorites", "Favorites first"], ["league", "League first"]]} />
        <fieldset className="st-field">
          <legend>Home sections</legend>
          <Toggle label="My teams" checked={d.sections.myTeams} onChange={(v) => setSection("myTeams", v)} />
          <Toggle label="My players" checked={d.sections.myPlayers} onChange={(v) => setSection("myPlayers", v)} />
          <Toggle label="League pulse" checked={d.sections.pulse} onChange={(v) => setSection("pulse", v)} />
        </fieldset>
      </Section>

      <Section id="notifications" title="Notifications">
        <AlertSettings />
      </Section>

      <Section id="application" title="Application">
        <h3>About Iceboard</h3>
        <p className="st-hint">Iceboard, NHL game intelligence. Version {pkg.version}.</p>
        <InstallCard />
        <h3>Data</h3>
        <p className="st-hint">Schedules, scores, standings and rosters come from public NHL data; advanced stats from MoneyPuck. When a source is unavailable Iceboard says so and may show a saved copy with its date.</p>
        <Methodology />
        <h3>Privacy</h3>
        <p className="st-hint">Your favorites, followed players, saved games and display choices are stored only in this browser on this device. There is no account, no tracking and no analytics. Clearing site data removes them.</p>
        <h3>Reset</h3>
        <button type="button" className="st-btn st-danger" onClick={() => setConfirm(true)}>Reset preferences</button>
      </Section>

      {picker && <TeamPicker selected={prefs.favorites} onChange={(ids) => setPrefs((p) => ({ ...p, favorites: ids }))} onClose={() => setPicker(false)} />}
      {confirm && (
        <Sheet title="Reset preferences" onClose={() => setConfirm(false)}>
          <p>This clears your favorites, followed players, saved games and display choices on this device. Nothing else is touched. This cannot be undone.</p>
          <div className="st-actions">
            <button type="button" className="st-btn" onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className="st-btn st-danger" onClick={() => { resetPrefs(); setConfirm(false); }}>Yes, reset everything</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
