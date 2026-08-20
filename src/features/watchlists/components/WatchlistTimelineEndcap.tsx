import { Flag, Loader2 } from "lucide-react";
import type { RefObject } from "react";

export function WatchlistTimelineEndcap({
  hasMore,
  sentinelRef,
}: {
  hasMore?: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative mt-12 pb-12" ref={sentinelRef}>
      <div className="flex items-center md:top-48">
        <TimelineStatusPill hasMore={hasMore} />
      </div>
    </div>
  );
}

function TimelineStatusPill({ hasMore }: { hasMore?: boolean }) {
  if (hasMore) {
    return (
      <div className="relative z-10 flex h-8 items-center gap-2 rounded-full bg-background px-4 text-xs font-medium text-muted-foreground ring-1 ring-border md:ml-4">
        <Loader2 className="size-3 animate-spin" />
        <span>Loading more...</span>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-8 items-center gap-2 rounded-full bg-background px-4 text-xs font-medium text-muted-foreground ring-1 ring-border md:ml-4">
      <Flag className="size-3" />
      <span>End of Watchlist</span>
    </div>
  );
}
