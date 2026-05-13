import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { WatchlistItem } from "@/db/schema";
import { cn } from "@/utils/cn";
import { TimelineItem } from "./timeline-item";

type ReorderableTimelineRowProps = {
  item: WatchlistItem;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  dropCue: "before" | "after" | null;
};

export function ReorderableTimelineRow({
  item,
  showHandleSlot,
  showHandle,
  interactionDisabled,
  dropCue,
}: ReorderableTimelineRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !showHandle,
  });

  return (
    <>
      {dropCue === "before" ? <InsertionGap /> : null}
      <div
        ref={setNodeRef}
        data-testid={`watchlist-timeline-row-${item.id}`}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        className={cn(
          "flex items-center gap-2 rounded-xl bg-background/80",
          isDragging && "z-20 opacity-60 shadow-xl ring-1 ring-border",
        )}
      >
        {showHandle ? (
          <button
            type="button"
            aria-label={`Move ${item.title}`}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-grab",
              isDragging
                ? "bg-secondary text-foreground shadow-sm cursor-grabbing"
                : "hover:bg-secondary hover:text-foreground active:cursor-grabbing",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : showHandleSlot ? (
          <div aria-hidden className="size-8 shrink-0" />
        ) : null}

        <div className="min-w-0 flex-1">
          <TimelineItem item={item} interactionDisabled={interactionDisabled} />
        </div>
      </div>
      {dropCue === "after" ? <InsertionGap /> : null}
    </>
  );
}

function InsertionGap() {
  return (
    <div
      aria-hidden
      className="my-1 h-4 rounded-xl border border-dashed border-primary/40 bg-primary/10"
    />
  );
}
