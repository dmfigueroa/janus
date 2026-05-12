import { useState } from "react";
import type { UnifiedMedia } from "@/server/media";
import DOMPurify from "dompurify";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Star, Calendar, Info } from "lucide-react";
import { addToWatchlist } from "@/features/watchlists/add/mutation";
import { getWatchlistList, watchlistListQueryKey } from "@/features/watchlists/queries";
import { toast } from "sonner";
import { WatchlistSelector } from "@/components/watchlist/WatchlistSelector";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

interface SearchMediaDetailSheetProps {
  media: UnifiedMedia | null;
  isOpen: boolean;
  onClose: () => void;
}

const watchlistSelectorFilters = { orderBy: "lastAdded" } as const;

export function SearchMediaDetailSheet({ media, isOpen, onClose }: SearchMediaDetailSheetProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>("");
  const getWatchlistListFn = useServerFn(getWatchlistList);
  const addToWatchlistFn = useServerFn(addToWatchlist);

  const { data: watchlists } = useQuery({
    queryKey: watchlistListQueryKey(watchlistSelectorFilters),
    queryFn: () => getWatchlistListFn({ data: watchlistSelectorFilters }),
    enabled: isOpen,
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!media || !selectedWatchlistId) return;
      return addToWatchlistFn({
        data: {
          watchlistId: Number.parseInt(selectedWatchlistId, 10),
          media,
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

  const {
    title,
    year,
    poster: posterUrl,
    backdrop: backdropUrl,
    rating,
    overview,
    mediaType,
  } = media;

  const displayRating = rating ? rating.toFixed(1) : "N/A";

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
              <img
                src={backdropUrl}
                alt={title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div className="flex gap-4 items-start">
            {posterUrl && !backdropUrl && (
              <img
                src={posterUrl}
                alt={title}
                className="w-24 rounded-md shadow-md"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="space-y-1">
              <SheetTitle className="text-2xl font-bold">{title}</SheetTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" /> {year || "TBA"}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 text-yellow-500 fill-yellow-500" /> {displayRating}
                </span>
                <span className="capitalize border px-1.5 py-0.5 rounded text-xs">
                  {mediaType === "tv" ? "TV Series" : mediaType}
                </span>
              </div>
            </div>
          </div>
          <SheetDescription className="text-base leading-relaxed text-foreground/90" asChild>
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(overview || "No description available."),
              }}
            />
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Add to Watchlist</h4>
          <div className="flex gap-3">
            <WatchlistSelector
              watchlists={watchlists}
              selectedWatchlistId={selectedWatchlistId}
              onSelect={setSelectedWatchlistId}
              disabled={!watchlists || watchlists.length === 0}
              className="flex-1"
            />
            <Button
              onClick={handleAddToWatchlist}
              disabled={!selectedWatchlistId || addToWatchlistMutation.isPending}
              className="min-w-[100px]"
            >
              {addToWatchlistMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
          {(mediaType === "tv" ||
            mediaType === "anime" ||
            mediaType === "comic" ||
            mediaType === "manga") && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p>
                Adding{" "}
                {mediaType === "tv"
                  ? "a TV show"
                  : mediaType === "anime"
                    ? "an anime"
                    : mediaType === "comic"
                      ? "a comic"
                      : "a manga"}{" "}
                will automatically add{" "}
                <strong>
                  all available{" "}
                  {mediaType === "tv" || mediaType === "anime" ? "episodes" : "issues/volumes"}
                </strong>{" "}
                to your watchlist. This allows you to track your progress step by step.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
