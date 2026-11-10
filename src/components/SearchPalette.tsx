import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildIndex, search } from "../lib/search.mjs";
import { openGame } from "../lib/open-game";
import { usePlayerProfile } from "./player/PlayerContext";
import { Icon } from "./icons";
import { TeamLogo } from "./TeamLogo";
import "../search.css";

type Index = ReturnType<typeof buildIndex>;
type Item = ReturnType<typeof search>["flat"][number];

const typing = (el: EventTarget | null) => {
  const e = el instanceof HTMLElement ? el : null;
  return !!e && (e.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName));
};

/** The header's Search button and the palette it opens (also Ctrl/Cmd+K, and "/" when not typing). Picks a team, game, player or page. */
export function SearchPalette({ index, onTeam, onView }: { index: Index; onTeam: (id: string) => void; onView: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const show = useCallback(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    const back = returnTo.current && document.contains(returnTo.current) ? returnTo.current : trigger.current;
    requestAnimationFrame(() => back?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (!open) show(); return; }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target) && !document.querySelector("dialog[open]")) { e.preventDefault(); show(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, show]);
  return (
    <>
      <button ref={trigger} type="button" className="search-trigger" aria-label="Search" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /" title="Search (Ctrl K or /)" onClick={show}>
        <Icon name="search" size={18} />
      </button>
      {open && <Palette index={index} onClose={hide} onTeam={onTeam} onView={onView} />}
    </>
  );
}

function Palette({ index, onClose, onTeam, onView }: { index: Index; onClose: () => void; onTeam: (id: string) => void; onView: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const uid = useId();
  const openPlayer = usePlayerProfile();
  const { groups, flat } = useMemo(() => search(index, q, { limit: 6 }), [index, q]);
  useEffect(() => { dialog.current?.showModal(); input.current?.focus(); }, []);
  useEffect(() => setActive(0), [q]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const pick = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    // Let the dialog close first so the screen it opens is not underneath a modal.
    setTimeout(() => {
      if (it.kind === "team") onTeam(String(it.payload.id));
      else if (it.kind === "game") openGame(it.payload.id);
      else if (it.kind === "player") openPlayer(it.payload as any);
      else onView(String(it.payload.id));
    }, 0);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (flat.length) setActive((a) => (a + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (flat.length) setActive((a) => (a - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter" && document.activeElement === input.current) { e.preventDefault(); pick(flat[active]); }
    else if (e.key === "Tab") {
      // Focus trap: the dialog holds the input and the close button.
      const f = [...(dialog.current?.querySelectorAll<HTMLElement>("input, button") ?? [])];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  let n = -1;
  return (
    <dialog ref={dialog} className="search-dialog" aria-label="Search" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === dialog.current) onClose(); }} onKeyDown={keys}>
      <div className="search-box">
        <Icon name="search" size={18} />
        <input
          ref={input} type="text" role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list"
          aria-label="Search teams, games, players and pages" aria-activedescendant={flat[active] ? `${uid}-${active}` : undefined}
          placeholder="Search teams, games, players, pages" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="search-close" onClick={onClose} aria-label="Close search">Esc</button>
      </div>
      {flat.length === 0 ? (
        <p className="search-empty" role="status">{q.trim() ? `No teams, games, players or pages match “${q.trim()}”.` : "Nothing to show yet. Type a team, a matchup like BOS vs TOR, or a page name."}</p>
      ) : (
        <ul ref={list} id={`${uid}-list`} className="search-list" role="listbox" aria-label="Results">
          {groups.map((g) => (
            <li key={g.kind} role="presentation" className="search-group">
              <span className="search-group-title" role="presentation">{g.label}</span>
              <ul role="presentation">
                {g.items.map((it) => {
                  const i = ++n;
                  return (
                    <li key={`${it.kind}-${it.id}`} id={`${uid}-${i}`} data-i={i} role="option" data-no-profile="" aria-selected={i === active} className="search-item" onMouseMove={() => active !== i && setActive(i)} onClick={() => pick(it)}>
                      <span className="search-lead" aria-hidden="true">
                        {it.kind === "team" ? <TeamLogo id={String(it.id)} size={22} /> : it.kind === "game" ? <Icon name="games" size={18} /> : it.kind === "player" ? <Icon name="players" size={18} /> : <Icon name="chevron" size={18} />}
                      </span>
                      <span className="search-text"><b>{it.title}</b>{it.subtitle && <small>{it.subtitle}</small>}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  );
}
