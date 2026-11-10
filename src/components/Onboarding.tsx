import type { Team } from "../types";
import { useFavorites } from "../hooks/useFavorites";
import { setPrefs } from "../lib/prefs.ts";
import { Sheet } from "./Sheet";
import { TeamLogo } from "./TeamLogo";
import "./favorites.css";

const finish = () => setPrefs((p) => (p.onboarded ? p : { ...p, onboarded: true }));

/** A small, non-blocking Home banner for first-time visitors, plus the team picker sheet (also opened from Teams and Settings). Never gates scores. */
export default function Onboarding({ teams, banner, open, onOpen, onClose }: { teams: Team[]; banner: boolean; open: boolean; onOpen: () => void; onClose: () => void }) {
  const { favorites, isFavorite, toggle } = useFavorites();
  const close = () => { finish(); onClose(); };
  return (
    <>
      {banner && !open && (
        <aside className="ob-banner" aria-label="Pick teams you follow" data-testid="onboarding">
          <p><b>Pick teams you follow.</b> They lead your scores. Saved on this device only; every team stays one tap away.</p>
          <button type="button" onClick={onOpen}>Pick teams</button>
          <button type="button" onClick={finish}>Skip</button>
        </aside>
      )}
      {open && (
        <Sheet title="Pick teams you follow" onClose={close}>
          <ul className="ob-grid">
            {teams.map((t) => (
              <li key={t.id}>
                <button type="button" aria-pressed={isFavorite(t.id)} aria-label={t.name} onClick={() => toggle(t.id)}>
                  <TeamLogo id={t.id} size={32} />
                  {t.id}
                </button>
              </li>
            ))}
          </ul>
          <div className="ob-actions">
            <p>{favorites.length ? `${favorites.length} selected` : "None selected: you will see every team."} Saved on this device.</p>
            <button type="button" onClick={close}>Skip</button>
            <button type="button" onClick={close}>Done</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
