import { useRouter, Link } from "@tanstack/react-router";
import { deleteWatchlist } from "@/server/watchlists";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { Watchlist } from "@/db/schema";
import type { WatchlistItem } from "@/db/schema";

interface EnrichedWatchlist extends Watchlist {
  stats: {
    totalItems: number;
    watchedItems: number;
    progress: number;
    nextUnwatched: WatchlistItem | null;
    coverImage: string | null;
    coverMediaType: "movie" | "episode" | "tv" | null;
  };
}

interface WatchlistCardProps {
  watchlist: EnrichedWatchlist;
}

export function WatchlistCard({ watchlist }: WatchlistCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  // Fallback gradient if no cover image
  const fallbackGradient = "bg-gradient-to-br from-zinc-800 to-zinc-900";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWatchlist({ data: { id: watchlist.id } });
      router.invalidate();
      toast.success("Watchlist deleted successfully");
    } catch (error) {
      console.error("Failed to delete", error);
      toast.error("Failed to delete watchlist. Please try again.");
      setDeleting(false);
    }
  };

  const { stats } = watchlist;
  const hasUnwatched = !!stats.nextUnwatched;
  const isEpisodeCover = stats.coverMediaType === "episode";

  return (
    <div className="flex flex-col gap-2 group relative">
      <Link
        to="/watchlists/$watchlistId"
        params={{ watchlistId: watchlist.id.toString() }}
        className="block h-full cursor-pointer transition-transform duration-300 active:scale-95"
      >
        <div
          className={cn(
            "relative aspect-[2/3] overflow-hidden rounded-2xl border-none shadow-2xl transition-all duration-300 group-hover:scale-[1.02]",
            !stats.coverImage && fallbackGradient,
          )}
        >
          {stats.coverImage ? (
            <>
              {isEpisodeCover ? (
                // Episode Layout: Blurred Background + Centered Landscape Image
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 overflow-hidden">
                  {/* Blurred Background */}
                  <img
                    src={`https://image.tmdb.org/t/p/w500${stats.coverImage}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl scale-150 opacity-80"
                  />
                  {/* Main Image */}
                  <div className="relative z-10 w-full aspect-video shadow-2xl">
                    <img
                      src={`https://image.tmdb.org/t/p/w500${stats.coverImage}`}
                      alt={watchlist.name}
                      className="w-full h-full object-cover rounded-sm shadow-black/50"
                    />
                  </div>
                </div>
              ) : (
                // Movie/Default Layout: Full Cover
                <img
                  src={`https://image.tmdb.org/t/p/w500${stats.coverImage}`}
                  alt={watchlist.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20">
              {/* Could add an icon here */}
            </div>
          )}

          {/* Dark Overlay for text legibility if needed, or just refined shadows */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

          {/* "Up Next" Badge - Only if there is something specifically next */}
          {hasUnwatched && (
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-md shadow-lg z-20">
              UP NEXT
            </div>
          )}
        </div>
      </Link>

      {/* Delete Button (Hidden till hover) */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
            }}
            disabled={deleting}
          >
            <X className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e: MouseEvent) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Watchlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{watchlist.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e: MouseEvent) => e.stopPropagation()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Info Section */}
      <div className="px-1">
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
        {/* Progress Bar */}
        <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              stats.progress === 100 ? "bg-green-500" : "bg-primary",
            )}
            style={{ width: `${stats.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
