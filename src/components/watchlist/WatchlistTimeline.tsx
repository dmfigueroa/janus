import type { WatchlistItem } from "@/db/schema";
import { TimelineItem } from "./TimelineItem";
import { useMemo } from "react";
import { Flag, Loader2 } from "lucide-react";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function WatchlistTimeline({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: WatchlistTimelineProps) {
  // Group items by year
  const groups = useMemo(() => {
    const grouped: { year: string; items: WatchlistItem[] }[] = [];

    let currentYear = "";
    let currentGroup: WatchlistItem[] = [];

    items.forEach((item) => {
      const year = item.releaseDate ? item.releaseDate.split("-")[0] : "TBA";

      if (year !== currentYear) {
        if (currentGroup.length > 0) {
          grouped.push({ year: currentYear, items: currentGroup });
        }
        currentYear = year;
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    });

    if (currentGroup.length > 0) {
      grouped.push({ year: currentYear, items: currentGroup });
    }

    return grouped;
  }, [items]);

  const { ref } = useIntersectionObserver({
    onIntersect: onLoadMore,
    enabled: hasMore && !isLoadingMore,
    rootMargin: "100px",
  });

  if (items.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground opacity-60">
        <p>No items in this watchlist yet.</p>
        <p className="text-sm">Add movies and shows from the Search page.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 md:pl-0">
      {/* Vertical Line - stops at the end marker */}
      <div className="absolute bottom-12 left-[26px] top-6 w-[2px] bg-border md:hidden" />
      <div className="absolute bottom-12 left-8 top-0 hidden w-[2px] bg-border md:block" />

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.year} className="relative">
            {/* Year Marker */}
            <div className="sticky top-44 z-10 mb-6 flex items-center md:top-48">
              <div className="relative flex h-8 items-center rounded-full bg-background px-4 text-xs font-bold text-foreground shadow-sm ring-1 ring-border md:ml-4">
                {group.year}
              </div>
            </div>

            <div className="space-y-2 md:pl-16">
              {group.items.map((item) => (
                <TimelineItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* End of Timeline Marker / Loading Trigger */}
      <div className="relative mt-12 pb-12" ref={ref}>
        <div className="flex items-center md:top-48">
          {hasMore ? (
            <div className="relative z-10 flex h-8 items-center gap-2 rounded-full bg-background px-4 text-xs font-medium text-muted-foreground ring-1 ring-border md:ml-4">
              <Loader2 className="size-3 animate-spin" />
              <span>Loading more...</span>
            </div>
          ) : (
            <div className="relative z-10 flex h-8 items-center gap-2 rounded-full bg-background px-4 text-xs font-medium text-muted-foreground ring-1 ring-border md:ml-4">
              <Flag className="size-3" />
              <span>End of Watchlist</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
