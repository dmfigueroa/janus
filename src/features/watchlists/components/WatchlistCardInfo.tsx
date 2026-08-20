import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { formatNextItemDetail } from "@/features/watchlists/NextItemLabel";
import { cn } from "@/utils/Cn";

export type WatchlistCardInfoVariant = "watchlist" | "up-next";

function formatUpNextSubtitleItem(watchlist: WatchlistSummary) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }

  return formatNextItemDetail(nextItem);
}

export function WatchlistCardInfo({
  watchlist,
  infoVariant,
}: {
  watchlist: WatchlistSummary;
  infoVariant: WatchlistCardInfoVariant;
}) {
  if (infoVariant === "up-next") {
    return <UpNextCardInfo watchlist={watchlist} />;
  }

  return <StandardCardInfo watchlist={watchlist} />;
}

function UpNextCardInfo({ watchlist }: { watchlist: WatchlistSummary }) {
  const nextItem = watchlist.stats.nextUnwatched;
  const featuredTitle = getFeaturedTitle(nextItem, watchlist.name);
  const featuredSubtitle = nextItem?.parentTitle ? formatUpNextSubtitleItem(watchlist) : null;

  return (
    <div className="px-1">
      <h3 className="text-lg font-bold leading-tight text-foreground">{featuredTitle}</h3>
      <FeaturedSubtitle subtitle={featuredSubtitle} />
    </div>
  );
}

function getFeaturedTitle(
  nextItem: WatchlistSummary["stats"]["nextUnwatched"],
  watchlistName: string,
) {
  if (!nextItem) {
    return watchlistName;
  }

  return getPreferredTitle(nextItem.parentTitle, nextItem.title, watchlistName);
}

function getPreferredTitle(parentTitle: string | null, title: string | null, fallback: string) {
  return parentTitle ?? title ?? fallback;
}

function FeaturedSubtitle({ subtitle }: { subtitle: string | null }) {
  if (!subtitle) {
    return null;
  }

  return <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{subtitle}</p>;
}

function StandardCardInfo({ watchlist }: { watchlist: WatchlistSummary }) {
  const stats = watchlist.stats;
  const complete = stats.progress === 100;

  return (
    <div className="px-1">
      <h3 className="font-bold text-lg text-foreground leading-tight truncate">{watchlist.name}</h3>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 mb-1">
        <span>{stats.totalItems} items</span>
        <span>•</span>
        <span className={cn(complete ? "text-green-500" : "text-primary")}>{stats.progress}%</span>
      </div>

      <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            complete ? "bg-green-500" : "bg-primary",
          )}
          style={{ width: `${stats.progress}%` }}
        />
      </div>
    </div>
  );
}
