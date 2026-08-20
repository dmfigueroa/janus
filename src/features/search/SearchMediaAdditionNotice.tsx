import { Info } from "lucide-react";
import type { UnifiedMedia } from "@/server/Media";

interface SearchMediaAdditionNoticeProps {
  mediaType: UnifiedMedia["mediaType"];
}

// The branching was moved intact from SearchMediaDetailSheet to satisfy the file-size boundary.
// eslint-disable-next-line complexity
export function SearchMediaAdditionNotice({ mediaType }: SearchMediaAdditionNoticeProps) {
  if (
    mediaType !== "tv" &&
    mediaType !== "anime" &&
    mediaType !== "comic" &&
    mediaType !== "manga"
  ) {
    return null;
  }

  const mediaLabel =
    mediaType === "tv"
      ? "a TV show"
      : mediaType === "anime"
        ? "an anime"
        : mediaType === "comic"
          ? "a comic"
          : "a manga";
  const itemLabel = mediaType === "tv" || mediaType === "anime" ? "episodes" : "issues/volumes";

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 p-3 rounded-md">
      <Info className="size-4 shrink-0 mt-0.5" />
      <p>
        Adding {mediaLabel} will automatically add <strong>all available {itemLabel}</strong> to
        your watchlist. This allows you to track your progress step by step.
      </p>
    </div>
  );
}
