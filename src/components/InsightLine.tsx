import "../insight-line.css";
import { VIEW_IDS, VIEW_TITLES } from "./MainNav";
import { TeamLink } from "./TeamProfile";

export type Insight = {
  id: string;
  kind: "stakes" | "form" | "schedule" | "odds" | "live";
  priority: number;
  text: string;
  detail: string;
  link: { view: string; team?: string };
};

/**
 * One true fact about a game. Card variant: plain text on one line (the card is itself a button, so nothing interactive in here and screen
 * readers read it with the card). List variant: the same text with its detail and real links.
 */
export function InsightLine({ insight, variant, onNavigate }: { insight: Insight; variant: "card" | "list"; onNavigate?: (view: string) => void }) {
  if (variant === "card") {
    return (
      <p className="insight" data-insight-id={insight.id} data-kind={insight.kind}>
        {insight.text}
      </p>
    );
  }
  const { view, team } = insight.link;
  const canGo = !!onNavigate && VIEW_IDS.includes(view);
  return (
    <div className="insight insight-list" data-insight-id={insight.id} data-kind={insight.kind}>
      <p className="insight-text">{insight.text}</p>
      <p className="insight-detail">{insight.detail}</p>
      {(canGo || team) && (
        <p className="insight-links">
          {canGo && (
            <button type="button" className="insight-link" onClick={() => onNavigate?.(view)} aria-label={`${insight.text}: open ${VIEW_TITLES[view] ?? view}`}>
              Open {VIEW_TITLES[view] ?? view}
            </button>
          )}
          {team && <TeamLink id={team} className="insight-link">{team} profile</TeamLink>}
        </p>
      )}
    </div>
  );
}
