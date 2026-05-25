import { Image } from "lucide-react";
import type { WatchlistItem } from "@/db/schema";
import { buildMediaPosterUrl } from "@/utils/tmdb";

type ItemPreviewProps = {
  item: WatchlistItem;
};

export function ItemPreview({ item }: ItemPreviewProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {item.posterPath ? (
        <img
          src={buildMediaPosterUrl(item.posterPath, "w92")}
          alt=""
          className="h-12 w-8 rounded object-cover shrink-0"
        />
      ) : (
        <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
          <Image size={16} className="text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground capitalize">{item.mediaType}</p>
      </div>
    </div>
  );
}
