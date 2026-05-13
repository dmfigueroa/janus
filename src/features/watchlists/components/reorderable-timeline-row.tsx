import { useSortable } from "@dnd-kit/sortable";
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
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: item.id,
    disabled: !showHandle,
  });

  return (
    <>
      {dropCue === "before" ? <InsertionGap /> : null}
      <div
        ref={setNodeRef}
        data-testid={`watchlist-timeline-row-${item.id}`}
        className={cn("rounded-xl", isDragging && "h-0 overflow-hidden opacity-0")}
      >
        <TimelineRowShell
          item={item}
          showHandleSlot={showHandleSlot}
          showHandle={showHandle}
          interactionDisabled={interactionDisabled}
          dragging={isDragging}
          handleProps={{
            ...attributes,
            ...listeners,
          }}
        />
      </div>
      {dropCue === "after" ? <InsertionGap /> : null}
    </>
  );
}

export function DragOverlayTimelineRow({
  item,
  interactionDisabled,
}: {
  item: WatchlistItem;
  interactionDisabled: boolean;
}) {
  return (
    <div className="rounded-xl bg-background/95 shadow-xl ring-1 ring-border">
      <TimelineRowShell
        item={item}
        showHandleSlot
        showHandle
        interactionDisabled={interactionDisabled}
        dragging
      />
    </div>
  );
}

function TimelineRowShell({
  item,
  showHandleSlot,
  showHandle,
  interactionDisabled,
  dragging,
  handleProps,
}: {
  item: WatchlistItem;
  showHandleSlot: boolean;
  showHandle: boolean;
  interactionDisabled: boolean;
  dragging: boolean;
  handleProps?: Record<string, unknown>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background/80">
      {showHandle ? (
        <button
          type="button"
          aria-label={`Move ${item.title}`}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-grab",
            dragging
              ? "bg-secondary text-foreground shadow-sm cursor-grabbing"
              : "hover:bg-secondary hover:text-foreground active:cursor-grabbing",
          )}
          {...handleProps}
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
