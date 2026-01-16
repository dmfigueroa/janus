"use client";

import { cn } from "@/utils/cn";
import { Check, Film, Tv } from "lucide-react";
import { WatchlistItem } from "@/server/watchlist";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { toggleWatched } from "@/server/watchlist";
import { useRouter } from "@tanstack/react-router";

interface TimelineItemProps {
  item: WatchlistItem;
}

export function TimelineItem({ item }: TimelineItemProps) {
  const router = useRouter();

  const toggleMutation = useMutation({
    mutationFn: async () => {
      // Optimistically toggle? For now just wait for server.
      await toggleWatched({ data: { itemId: item.id, isWatched: !item.isWatched } });
    },
    onSuccess: () => {
      router.invalidate();
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  const isMovie = item.mediaType === "movie";

  // Fix hydration mismatch: Parse YYYY-MM-DD as local date to avoid timezone shifts
  let date = null;
  if (item.releaseDate) {
    const [year, month, day] = item.releaseDate.split("-").map(Number);
    date = new Date(year, month - 1, day);
  }

  const formattedDate = date ? format(date, "MMMM d") : "TBA";

  // Runtime formatting
  const formatRuntime = (mins: number | null) => {
    if (!mins) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const runtimeStr = formatRuntime(item.runtime);

  const posterUrl = item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-4 py-4 pr-4 transition-opacity",
        item.isWatched && "opacity-60",
      )}
    >
      {/* Poster / Thumbnail */}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden font-bold shadow-md ring-1 ring-border",
          isMovie ? "h-24 w-16 rounded-lg" : "h-16 w-16 rounded-full",
        )}
      >
        {posterUrl ? (
          <img src={posterUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
            {isMovie ? <Film size={20} /> : <Tv size={20} />}
          </div>
        )}

        {isMovie && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[10px] uppercase tracking-wider text-white backdrop-blur-[2px]">
            Movie
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {item.parentTitle && (
          <span className="text-xs font-medium uppercase tracking-wider text-primary">
            {item.parentTitle}
          </span>
        )}
        <h3 className="line-clamp-1 text-lg font-semibold leading-tight text-foreground">
          {item.title}
        </h3>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {/* Season/Ep for TV */}
          {!isMovie && item.season && item.episode && (
            <span>
              S{item.season} E{item.episode}
            </span>
          )}

          <span>{formattedDate}</span>

          {runtimeStr && <span className="flex items-center gap-1">• {runtimeStr}</span>}
        </div>
      </div>

      {/* Action */}
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
