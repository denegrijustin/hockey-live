import { useFollowedPlayers, type FollowRef } from "../hooks/useFollowedPlayers";
import { Icon } from "./icons";
import "../follow.css";

/** Follow / unfollow a player (saved on this device). `compact` is a star-only button for rows; the accessible name is always "Follow <name>" / "Unfollow <name>". */
export function FollowButton({ player, compact = false }: { player: FollowRef; compact?: boolean }) {
  const { isFollowing, toggle, atLimit } = useFollowedPlayers();
  const on = isFollowing(player.id);
  const name = player.name || "player";
  const blocked = !on && atLimit;
  return (
    <button
      type="button"
      className={`follow-btn${compact ? " compact" : ""}${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={`${on ? "Unfollow" : "Follow"} ${name}`}
      title={blocked ? "Following limit reached (100 players)" : on ? `Unfollow ${name}` : `Follow ${name} (saved on this device)`}
      disabled={blocked}
      onClick={(e) => { e.stopPropagation(); toggle(player); }}
    >
      <Icon name="star" size={compact ? 18 : 16} />
      {!compact && <span aria-hidden="true">{on ? "Following" : "Follow"}</span>}
    </button>
  );
}
