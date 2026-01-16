"use client";

import { useState, useEffect } from "react";
import { TMDBMedia } from "@/server/tmdb";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Star, Calendar, Info } from "lucide-react";
import { addToWatchlist } from "@/server/watchlist";
import { getWatchlists } from "@/server/watchlists";
import { toast } from "sonner";
// We might need a Select component if we have multiple watchlists.
// Checking availability or defaulting to a simple list if not available.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";

interface MediaDetailSheetProps {
  media: TMDBMedia | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MediaDetailSheet({ media, isOpen, onClose }: MediaDetailSheetProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>("");

  // Reset selected watchlist on open
  useEffect(() => {
    if (isOpen) {
      setSelectedWatchlistId("");
    }
  }, [isOpen]);

  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => getWatchlists(),
    enabled: isOpen,
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!media || !selectedWatchlistId) return;
      return addToWatchlist({
        data: {
          watchlistId: parseInt(selectedWatchlistId),
          media: media,
        },
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message);
        onClose();
      } else {
        toast.error(data?.message || "Failed to add to watchlist");
      }
    },
    onError: (error) => {
      toast.error("An error occurred");
      console.error(error);
    },
  });

  if (!media) return null;

  const title = media.title || media.name || "Unknown Title";
  const date = media.release_date || media.first_air_date;
  const year = date ? new Date(date).getFullYear() : "TBA";
  const backdropUrl = media.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
    : null;
  const posterUrl = media.poster_path
    ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
    : null;

  const rating = media.vote_average ? media.vote_average.toFixed(1) : "N/A";

  const handleAddToWatchlist = () => {
    if (!selectedWatchlistId) {
      toast.error("Please select a watchlist");
      return;
    }
    addToWatchlistMutation.mutate();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md md:max-w-lg lg:max-w-xl overflow-y-auto no-scrollbar">
        <SheetHeader className="text-left space-y-4">
          {backdropUrl && (
            <div className="relative -mx-6 -mt-6 mb-4 aspect-video w-[calc(100%+3rem)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10" />
              <img src={backdropUrl} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex gap-4 items-start">
            {posterUrl && !backdropUrl && (
              <img src={posterUrl} alt={title} className="w-24 rounded-md shadow-md" />
            )}
            <div className="space-y-1">
              <SheetTitle className="text-2xl font-bold">{title}</SheetTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" /> {year}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 text-yellow-500 fill-yellow-500" /> {rating}
                </span>
                <span className="capitalize border px-1.5 py-0.5 rounded textxs">
                  {media.media_type === "tv" ? "TV Series" : "Movie"}
                </span>
              </div>
            </div>
          </div>
          <SheetDescription className="text-base leading-relaxed text-foreground/90">
            {media.overview}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Add to Watchlist</h4>
          <div className="flex gap-3">
            <Select value={selectedWatchlistId} onValueChange={setSelectedWatchlistId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a watchlist" />
              </SelectTrigger>
              <SelectContent>
                {watchlists && watchlists.length > 0 ? (
                  watchlists.map((list) => (
                    <SelectItem key={list.id} value={list.id.toString()}>
                      {list.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No watchlists found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddToWatchlist}
              disabled={!selectedWatchlistId || addToWatchlistMutation.isPending}
              className="min-w-[100px]"
            >
              {addToWatchlistMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
          {media.media_type === "tv" && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p>
                Adding a TV show will automatically add <strong>all available episodes</strong> to
                your watchlist. This allows you to track your progress episode by episode.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="mt-8 sm:justify-start">{/* Optional footer actions */}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
