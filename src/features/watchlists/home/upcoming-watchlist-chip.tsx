import { Link } from "@tanstack/react-router";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { formatNextItemWithParentTitle } from "@/features/watchlists/next-item-label";
import { cn } from "@/utils/cn";

type UpcomingWatchlist =
  WatchlistHomeQueryData["featuredSections"][number]["upcomingWatchlists"][number];

function formatIncomingWatchlistLabel(watchlist: UpcomingWatchlist) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }

  return formatNextItemWithParentTitle(nextItem);
}

type UpcomingWatchlistChipProps = {
  watchlist: UpcomingWatchlist;
};

export function UpcomingWatchlistChip({ watchlist }: UpcomingWatchlistChipProps) {
  const label = formatIncomingWatchlistLabel(watchlist);
  if (!label) {
    return null;
  }

  return (
    <Link
      to="/watchlists/$watchlistId"
      params={{ watchlistId: watchlist.id.toString() }}
      preload="viewport"
      className={cn(
        "inline-flex max-w-full items-center rounded-full border border-border/70",
        "bg-card/70 px-3 py-1.5 text-sm font-medium text-muted-foreground",
        "transition-colors hover:border-primary/40 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}
