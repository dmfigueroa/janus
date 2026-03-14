"use client";

import { useState } from "react";
import { UnifiedMedia } from "@/server/media";
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
import { toast } from "sonner";
import { WatchlistSelector } from "./watchlist/WatchlistSelector";
import { useWatchlistImportWorkflow } from "@/hooks/useWatchlistImportWorkflow";
import { useWatchlistOptions } from "@/hooks/useWatchlistOptions";

interface MediaDetailSheetProps {
  media: UnifiedMedia | null;
  isOpen: boolean;
  onClose: () => void;
}

const MEDIA_TYPE_DISPLAY: Partial<
  Record<
    UnifiedMedia["mediaType"],
    {
      chipLabel?: string;
      importHint?: {
        itemLabel: string;
        mediaLabel: string;
      };
    }
  >
> = {
  anime: {
    importHint: { mediaLabel: "an anime", itemLabel: "episodes" },
  },
  comic: {
    importHint: { mediaLabel: "a comic", itemLabel: "issues/volumes" },
  },
  manga: {
    importHint: { mediaLabel: "a manga", itemLabel: "issues/volumes" },
  },
  tv: {
    chipLabel: "TV Series",
    importHint: { mediaLabel: "a TV show", itemLabel: "episodes" },
  },
};

export function MediaDetailSheet({ media, isOpen, onClose }: MediaDetailSheetProps) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const { data: watchlists } = useWatchlistOptions(isOpen);
  const { resetImportWorkflow, startImport, status } = useWatchlistImportWorkflow({
    media,
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
  const mediaTypeDisplay = MEDIA_TYPE_DISPLAY[mediaType];
  const mediaTypeLabel = mediaTypeDisplay?.chipLabel ?? mediaType;
  const overviewHtml = DOMPurify.sanitize(overview || "No description available.");
  const isSubmitDisabled =
    !selectedWatchlistId || status.kind === "submitting" || status.kind === "importing";

  const addSelectedWatchlist = async () => {
    if (!selectedWatchlistId) {
      toast.error("Please select a watchlist");
      return;
    }

    const { resolution } = await startImport(Number.parseInt(selectedWatchlistId, 10));

    if (resolution.kind === "completed") {
      toast.success(resolution.message);
      handleClose();
      return;
    }

    if (resolution.kind === "failed") {
      toast.error(resolution.message);
    }
  };

  const handleClose = () => {
    resetImportWorkflow();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
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
                  {mediaTypeLabel}
                </span>
              </div>
            </div>
          </div>
          <SheetDescription className="text-base leading-relaxed text-foreground/90" asChild>
            {/* Some providers return trusted-rich descriptions, so we sanitize instead of flattening them. */}
            <div dangerouslySetInnerHTML={{ __html: overviewHtml }} />
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
              onClick={addSelectedWatchlist}
              disabled={isSubmitDisabled}
              className="min-w-[100px]"
            >
              {status.kind === "submitting" ? "Adding..." : "Add"}
            </Button>
          </div>
          {status.kind === "importing" && status.message ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
              {status.message}
            </div>
          ) : null}
          {mediaTypeDisplay?.importHint && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p>
                Adding {mediaTypeDisplay.importHint.mediaLabel} will automatically add{" "}
                <strong>all available {mediaTypeDisplay.importHint.itemLabel}</strong> to your
                watchlist. This allows you to track your progress step by step.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
