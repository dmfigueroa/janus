import { useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { deleteWatchlist } from "@/features/watchlists/delete/mutation";
import { skipWatchlist } from "@/features/watchlists/skip/mutation";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import type { WatchlistSummary } from "@/models/watchlist";
import { formatNextItemDetail } from "@/features/watchlists/next-item-label";
import { DeleteWatchlistButton } from "./DeleteWatchlistButton";
import { Check } from "lucide-react";

export type EnrichedWatchlist = WatchlistSummary;
type WatchlistCardInfoVariant = "watchlist" | "up-next";

import { tmdbImageUrl } from "@/utils/tmdb";

const CoverImage = ({ watchlist }: { watchlist: EnrichedWatchlist }) => {
  const stats = watchlist.stats;
  if (!stats.coverImage) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20">
        {/* Could add an icon here */}
      </div>
    );
  }

  const coverImageUrl = tmdbImageUrl(stats.coverImage, "w500");
  const isEpisodeCover = stats.coverMediaType === "episode";

  return (
    <>
      {isEpisodeCover ? (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 overflow-hidden">
          <img
            src={coverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-150 opacity-80"
          />
          <div className="relative z-10 w-full aspect-video shadow-2xl">
            <img
              src={coverImageUrl}
              alt={watchlist.name}
              className="w-full h-full object-cover rounded-sm shadow-black/50"
            />
          </div>
        </div>
      ) : (
        <img
          src={coverImageUrl}
          alt={watchlist.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
    </>
  );
};

function formatUpNextSubtitleItem(watchlist: EnrichedWatchlist) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }

  return formatNextItemDetail(nextItem);
}

const WatchlistInfo = ({
  watchlist,
  infoVariant,
}: {
  watchlist: EnrichedWatchlist;
  infoVariant: WatchlistCardInfoVariant;
}) => {
  const stats = watchlist.stats;
  const nextItem = stats.nextUnwatched;
  const featuredTitle = nextItem?.parentTitle ?? nextItem?.title ?? watchlist.name;
  const featuredSubtitle = nextItem?.parentTitle ? formatUpNextSubtitleItem(watchlist) : null;

  return (
    <div className="px-1">
      {infoVariant === "up-next" ? (
        <>
          <h3 className="text-lg font-bold leading-tight text-foreground">{featuredTitle}</h3>
          {featuredSubtitle ? (
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{featuredSubtitle}</p>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="font-bold text-lg text-foreground leading-tight truncate">
            {watchlist.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 mb-1">
            <span>{stats.totalItems} items</span>
            <span>•</span>
            <span className={cn(stats.progress === 100 ? "text-green-500" : "text-primary")}>
              {stats.progress}%
            </span>
          </div>

          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                stats.progress === 100 ? "bg-green-500" : "bg-primary",
              )}
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export function WatchlistCard({
  watchlist,
  selectionMode = false,
  isSelected = false,
  onToggle,
  showDeleteButton = true,
  showUpNextBadge = true,
  showSkipButton = false,
  infoVariant = "watchlist",
}: {
  watchlist: EnrichedWatchlist;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  showDeleteButton?: boolean;
  showUpNextBadge?: boolean;
  showSkipButton?: boolean;
  infoVariant?: WatchlistCardInfoVariant;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const deleteWatchlistFn = useServerFn(deleteWatchlist);
  const skipWatchlistFn = useServerFn(skipWatchlist);

  const fallbackGradient = "bg-gradient-to-br from-zinc-800 to-zinc-900";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWatchlistFn({ data: { id: watchlist.id } });
      await router.invalidate?.();
      toast.success("Watchlist deleted successfully");
    } catch (error) {
      console.error("Failed to delete", error);
      toast.error("Failed to delete watchlist. Please try again.");
      setDeleting(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const result = await skipWatchlistFn({ data: { watchlistId: watchlist.id } });
      if (!result.success) {
        throw new Error("Failed to skip watchlist");
      }
      await router.invalidate?.();
    } catch (error) {
      console.error("Failed to skip watchlist", error);
      toast.error("Failed to skip watchlist. Please try again.");
    } finally {
      setSkipping(false);
    }
  };

  const { stats } = watchlist;
  const hasUnwatched = !!stats.nextUnwatched;

  const CardContent = (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-2xl border-none shadow-2xl transition-all duration-300",
        !stats.coverImage && fallbackGradient,
        selectionMode ? "cursor-pointer scale-[0.98]" : "group-hover:scale-[1.02]",
        isSelected && "ring-4 ring-primary",
      )}
      onClick={(e) => {
        if (selectionMode) {
          e.preventDefault();
          onToggle?.();
        }
      }}
    >
      <CoverImage watchlist={watchlist} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

      {selectionMode && (
        <div className="absolute top-3 right-3 z-30">
          <div
            className={cn(
              "h-6 w-6 rounded-full border-2 border-white flex items-center justify-center transition-colors",
              isSelected ? "bg-primary border-primary" : "bg-black/40",
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      )}

      {(showUpNextBadge || showSkipButton) && hasUnwatched && !selectionMode ? (
        <div
          className={cn(
            "absolute left-3 right-3 top-3 z-20 flex items-start gap-2",
            showUpNextBadge ? "justify-between" : "justify-end",
          )}
        >
          {showUpNextBadge && (
            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-md shadow-lg">
              UP NEXT
            </div>
          )}

          {showSkipButton ? (
            <button
              type="button"
              className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white shadow-lg transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleSkip();
              }}
              disabled={skipping}
              aria-label={`Skip ${watchlist.name}`}
            >
              Skip
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 group relative">
      {selectionMode ? (
        CardContent
      ) : (
        <Link
          to="/watchlists/$watchlistId"
          params={{ watchlistId: watchlist.id.toString() }}
          preload="viewport"
          className="block h-full cursor-pointer transition-transform duration-300 active:scale-95"
        >
          {CardContent}
        </Link>
      )}

      {showDeleteButton && !selectionMode && (
        <DeleteWatchlistButton
          watchlist={watchlist}
          deleting={deleting}
          handleDelete={handleDelete}
        />
      )}

      <WatchlistInfo watchlist={watchlist} infoVariant={infoVariant} />
    </div>
  );
}
