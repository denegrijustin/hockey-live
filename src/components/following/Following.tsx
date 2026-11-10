import { PageHeader } from "../PageHeader";
import { PlayersWatchlist } from "./PlayersWatchlist";

/** Following view (Agent 5 owns the shell: Players | Games tabs; Agent 2 supplies the players tab). Interim shell: renders the players watchlist. */
export function Following() {
  return (
    <section aria-label="Following">
      <PageHeader title="Following" eyebrow="MY ICEBOARD" />
      <PlayersWatchlist />
    </section>
  );
}
