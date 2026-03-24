"use client";

import { cn } from "@/utils/cn";
import { Check, Film, Tv, Gamepad2, Book, BookOpen } from "lucide-react";
import type { WatchlistItem } from "@/db/schema";
import { formatReleaseDate, formatRuntime } from "@/utils/datetime";
import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toggleWatched } from "@/server/watchlist";
import {
  type WatchlistDetailQueryData,
  updateWatchlistDetailPagesAfterToggle,
  watchlistDetailQueryFamily,
} from "@/features/watchlists/detail/query";

type TimelineItemProps = {
  item: WatchlistItem;
};

const getMediaConfig = (type: string) => {
  switch (type) {
    case "movie":
      return { label: "Movie", icon: Film, isPortrait: true };
    case "episode":
      return { label: null, icon: Tv, isPortrait: false };
    case "game":
      return { label: "Game", icon: Gamepad2, isPortrait: true };
    case "book":
      return { label: "Book", icon: Book, isPortrait: true };
    case "comic":
      return { label: "Comic", icon: BookOpen, isPortrait: true };
    default:
      return { label: null, icon: Film, isPortrait: true };
  }
};

const Poster = ({ mediaType, posterPath, title }: WatchlistItem) => {
  const config = getMediaConfig(mediaType);
  const Icon = config.icon;

  const posterUrl = posterPath
    ? posterPath.startsWith("http")
      ? posterPath
      : `https://image.tmdb.org/t/p/w200${posterPath}`
    : null;

  return (
    <div className="flex w-20 md:w-28 shrink-0 justify-center">
      <div
        className={cn(
          "relative shrink-0 overflow-hidden font-bold shadow-md ring-1 ring-border",
          config.isPortrait
            ? "h-24 w-16 md:h-32 md:w-20 rounded-lg"
            : "h-12 md:h-16 w-full rounded-md",
        )}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
            <Icon size={20} />
          </div>
        )}

        {config.label && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[10px] uppercase tracking-wider text-white backdrop-blur-[2px]">
            {config.label}
          </div>
        )}
      </div>
    </div>
  );
};

const Content = ({
  parentTitle,
  title,
  mediaType,
  season,
  episode,
  releaseDate,
  runtime,
}: WatchlistItem) => {
  const formattedDate = formatReleaseDate(releaseDate);
  const runtimeStr = formatRuntime(runtime);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      {parentTitle && (
        <span className="text-xs font-medium uppercase tracking-wider text-primary">
          {parentTitle}
        </span>
      )}
      <h3 className="text-base font-semibold leading-tight text-foreground md:text-lg">{title}</h3>
      <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm text-muted-foreground">
        {mediaType !== "movie" && (
          <>
            {mediaType === "comic" && episode ? (
              <span>Issue #{episode}</span>
            ) : season && episode ? (
              <span>
                S{season} E{episode}
              </span>
            ) : null}
          </>
        )}

        <span>{formattedDate}</span>

        {runtimeStr && <span className="flex items-center gap-1">• {runtimeStr}</span>}
      </div>
    </div>
  );
};

export function TimelineItem({ item }: TimelineItemProps) {
  const queryClient = useQueryClient();
  const queryKey = watchlistDetailQueryFamily(item.watchlistId);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await toggleWatched({ data: { itemId: item.id, isWatched: !item.isWatched } });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousEntries = queryClient.getQueriesData<
        InfiniteData<WatchlistDetailQueryData, number>
      >({ queryKey });

      queryClient.setQueriesData<InfiniteData<WatchlistDetailQueryData, number>>(
        { queryKey },
        (old) =>
          updateWatchlistDetailPagesAfterToggle({
            data: old,
            itemId: item.id,
            nextIsWatched: !item.isWatched,
          }),
      );

      return { previousEntries };
    },
    onError: (_err, _newTodo, context) => {
      for (const [cacheKey, previousData] of context?.previousEntries ?? []) {
        queryClient.setQueryData(cacheKey, previousData);
      }

      toast.error("Failed to update status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 md:gap-4 py-3 md:py-4 pr-2 md:pr-4 transition-opacity",
        item.isWatched && "opacity-60",
      )}
    >
      <Poster {...item} />
      <Content {...item} />

      <button
        onClick={() => toggleMutation.mutate()}
        disabled={toggleMutation.isPending}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 active:scale-95 disabled:pointer-events-none",
          item.isWatched
            ? "border-primary bg-primary text-primary-foreground shadow-[0_0_10px_rgba(255,0,85,0.4)]"
            : "border-muted-foreground/30 text-transparent hover:border-primary/50",
        )}
      >
        <Check
          size={16}
          strokeWidth={3}
          className={cn("transition-all", item.isWatched ? "scale-100" : "scale-0")}
        />
      </button>
    </div>
  );
}
