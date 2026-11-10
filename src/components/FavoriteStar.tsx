import { Star } from "lucide-react";
import { useFavorites } from "../hooks/useFavorites";
import "./favorites.css";

/** The one favorite toggle used everywhere: a 44px target, pressed when the team is a favorite. Saved on this device only. */
export function FavoriteStar({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(id);
  return (
    <button type="button" className={`fav-star${on ? " on" : ""} ${className}`} data-no-profile="" data-fav={id} aria-pressed={on} aria-label={on ? `Remove ${name} from favorites` : `Add ${name} to favorites`} title={on ? "Favorite team (saved on this device)" : "Add to favorites (saved on this device)"} onClick={(e) => { e.stopPropagation(); toggle(id); }}>
      <Star size={20} aria-hidden="true" fill={on ? "currentColor" : "none"} />
    </button>
  );
}

/** A small non-interactive marker for a favorite team (cards, schedule rows). */
export function FavoriteMark({ id, sr = false }: { id: string; sr?: boolean }) {
  const { isFavorite } = useFavorites();
  if (!isFavorite(id)) return null;
  return <span className="fav-mark" title="Favorite team"><Star size={11} aria-hidden="true" fill="currentColor" />{sr && <span className="sr-only">Favorite</span>}</span>;
}
