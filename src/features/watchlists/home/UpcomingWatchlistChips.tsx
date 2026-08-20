import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { UpcomingWatchlistChip } from "@/features/watchlists/home/UpcomingWatchlistChip";

type UpcomingWatchlistChipsProps = {
  watchlists: Awaited<
    ReturnType<typeof getWatchlistHome>
  >["featuredSections"][number]["upcomingWatchlists"];
};

export function UpcomingWatchlistChips({ watchlists }: UpcomingWatchlistChipsProps) {
  if (watchlists.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <p className="mb-2 text-sm font-medium text-muted-foreground">Coming up after these</p>
      <div className="flex flex-wrap gap-2">
        {watchlists.map((watchlist) => (
          <UpcomingWatchlistChip key={watchlist.id} watchlist={watchlist} />
        ))}
      </div>
    </div>
  );
}
