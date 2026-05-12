import type { WatchlistItem } from "@/db/schema";
import { TimelineItem } from "./TimelineItem";
import { useMemo, useState } from "react";
import { Flag, GripVertical, Loader2 } from "lucide-react";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { cn } from "@/utils/cn";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  canReorder?: boolean;
  onReorder?: (itemIds: number[]) => void;
}

export function WatchlistTimeline({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder = false,
  onReorder,
}: WatchlistTimelineProps) {
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const reorderEnabled = canReorder && Boolean(onReorder);

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

  function submitDrop(targetItemId: number, placement: "before" | "after") {
    if (!reorderEnabled || draggedItemId === null || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      return;
    }

    const reorderedIds = items.map((item) => item.id).filter((itemId) => itemId !== draggedItemId);
    const targetIndex = reorderedIds.indexOf(targetItemId);

    if (targetIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    reorderedIds.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedItemId);
    onReorder?.(reorderedIds);
    setDraggedItemId(null);
  }

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
                <div
                  key={item.id}
                  data-testid={`watchlist-timeline-row-${item.id}`}
                  onDragOver={(event) => {
                    if (!reorderEnabled) {
                      return;
                    }

                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const placement =
                      bounds.height > 0 && event.clientY < bounds.top + bounds.height / 2
                        ? "before"
                        : "after";
                    submitDrop(item.id, placement);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md",
                    draggedItemId === item.id && "opacity-50",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Move ${item.title}`}
                    disabled={!reorderEnabled}
                    draggable={reorderEnabled}
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDragEnd={() => setDraggedItemId(null)}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
                      reorderEnabled
                        ? "cursor-grab hover:bg-secondary hover:text-foreground active:cursor-grabbing"
                        : "cursor-not-allowed opacity-35",
                    )}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <TimelineItem item={item} />
                  </div>
                </div>
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
