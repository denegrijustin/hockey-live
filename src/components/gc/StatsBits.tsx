import "./stats.css";
import { useGameBox } from "../../hooks/useGameBox";

/** "Official" (NHL numbers) or "Derived" (counted by Iceboard from official data) tag. */
export function Src({ kind }: { kind: "official" | "derived" | null | undefined }) {
  if (!kind) return null;
  return <span className="gcs-src" data-src={kind} title={kind === "official" ? "Published by the NHL" : "Counted by Iceboard from official data"}>{kind === "official" ? "Official" : "Derived"}</span>;
}

/** Loading / not-published / update-failed messages shared by both panes. Returns null when there is nothing to say. */
export function BoxNotice({ box, error, started, loading, live }: ReturnType<typeof useGameBox>) {
  if (!started) return <p className="gcs-note" role="status">Box score appears after puck drop.</p>;
  if (loading) return <p className="gcs-note" role="status">Loading box score…</p>;
  if (!box) return <p className="gcs-note warn" role="status">{error ? "The box score is not published yet or could not be loaded. It usually appears shortly after puck drop." : "Box score unavailable."}</p>;
  if (error) return <p className="gcs-note warn" role="status">Update unavailable — showing the last received numbers, which may be out of date.</p>;
  return live ? <p className="gcs-note">Live: refreshes every 30 seconds.</p> : null;
}
