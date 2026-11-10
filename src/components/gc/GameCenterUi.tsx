import { createContext, useContext } from "react";

export type GcTab = "overview" | "pbp" | "stats" | "players" | "intel";

/**
 * Layout-level state of the Game Center that panes may read (kept apart from GameCenterContext, which holds game data):
 * the active tab, the play-by-play event to land on (`?event=`), and `goTab` to move to another pane (optionally to an event).
 * Outside a Game Center the defaults are inert, so panes render in isolation.
 */
export type GameCenterUi = {
  tab: GcTab;
  /** NHL eventId the Play-by-Play pane should scroll to and highlight, or null. */
  focusEvent: number | null;
  goTab: (tab: GcTab, event?: number | null) => void;
};

const Ui = createContext<GameCenterUi>({ tab: "overview", focusEvent: null, goTab: () => {} });
export const GameCenterUiProvider = Ui.Provider;
export const useGameCenterUi = () => useContext(Ui);
