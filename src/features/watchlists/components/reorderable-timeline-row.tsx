import { GripVertical } from "lucide-react";
import type { WatchlistItem } from "@/db/schema";
import { orderItemIdsAfterDrop, type DropPlacement } from "@/features/watchlists/detail/reorder";
import { cn } from "@/utils/cn";
import { TimelineItem } from "./timeline-item";

type ReorderableTimelineRowProps = {
  item: WatchlistItem;
  items: WatchlistItem[];
  reorderEnabled: boolean;
  draggedItemId: number | null;
  onDragStart: (itemId: number) => void;
  onDragEnd: () => void;
  onReorder?: (itemIds: number[]) => void;
};

export function ReorderableTimelineRow({
  item,
  items,
  reorderEnabled,
  draggedItemId,
  onDragStart,
  onDragEnd,
  onReorder,
}: ReorderableTimelineRowProps) {
  function submitDrop(targetItemId: number, placement: DropPlacement) {
    if (!reorderEnabled || draggedItemId === null) {
      onDragEnd();
      return;
    }

    const reorderedIds = orderItemIdsAfterDrop({
      items,
      draggedItemId,
      targetItemId,
      placement,
    });

    if (reorderedIds) {
      onReorder?.(reorderedIds);
    }

    onDragEnd();
  }

  return (
    <div
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
          bounds.height > 0 && event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
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
        onDragStart={() => onDragStart(item.id)}
        onDragEnd={onDragEnd}
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
  );
}
