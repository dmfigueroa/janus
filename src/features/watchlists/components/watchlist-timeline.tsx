import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/query";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { ReorderIntent } from "@/features/watchlists/detail/reorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { Flag, Loader2 } from "lucide-react";
import { useMemo, type RefObject } from "react";
import { DragOverlayTimelineRow, ReorderableTimelineRow } from "./reorderable-timeline-row";
import { useWatchlistTimelineReorder } from "./use-watchlist-timeline-reorder";
import {
  buildWatchlistTimelineGroups,
  type WatchlistTimelineGroup,
} from "./watchlist-timeline.model";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  activeFilters: WatchlistDetailQueryFilters;
  itemOrderMode: WatchlistItemOrderMode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  canReorder?: boolean;
  interactionDisabled?: boolean;
  reorderFailed?: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

export function WatchlistTimeline({
  items,
  activeFilters,
  itemOrderMode,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder = false,
  interactionDisabled = false,
  reorderFailed = false,
  onReorder,
}: WatchlistTimelineProps) {
  const {
    activeItem,
    displayedItems,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    reorderEnabled,
    sensors,
  } = useWatchlistTimelineReorder({
    items,
    itemOrderMode,
    canReorder,
    reorderFailed,
    onReorder,
  });
  const showHandleSlot = itemOrderMode === "custom";
  const groups = useMemo(
    () => buildWatchlistTimelineGroups(displayedItems, itemOrderMode),
    [displayedItems, itemOrderMode],
  );

  const { ref } = useIntersectionObserver({
    onIntersect: interactionDisabled ? undefined : onLoadMore,
    enabled: Boolean(onLoadMore && hasMore && !isLoadingMore && !interactionDisabled),
    rootMargin: "100px",
  });

  if (items.length === 0) {
    return <EmptyWatchlistState />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <DragOverlay>
        {activeItem ? (
          <DragOverlayTimelineRow item={activeItem} interactionDisabled={interactionDisabled} />
        ) : null}
      </DragOverlay>

      <div className="relative pl-6 md:pl-0" style={{ overflowAnchor: "none" }}>
        <ReleaseTimelineDecorations itemOrderMode={itemOrderMode} />
        <TimelineGroups
          groups={groups}
          activeFilters={activeFilters}
          itemOrderMode={itemOrderMode}
          interactionDisabled={interactionDisabled}
          reorderEnabled={reorderEnabled}
          showHandleSlot={showHandleSlot}
        />
        <TimelineEndcap hasMore={hasMore} sentinelRef={ref} />
      </div>
    </DndContext>
  );
}

function EmptyWatchlistState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground opacity-60">
      <p>No items in this watchlist yet.</p>
      <p className="text-sm">Add movies and shows from the Search page.</p>
    </div>
  );
}

function ReleaseTimelineDecorations({ itemOrderMode }: { itemOrderMode: WatchlistItemOrderMode }) {
  if (itemOrderMode !== "release") {
    return null;
  }

  return (
    <>
      <div className="absolute bottom-12 left-[26px] top-6 w-[2px] bg-border md:hidden" />
      <div className="absolute bottom-12 left-8 top-0 hidden w-[2px] bg-border md:block" />
    </>
  );
}

function TimelineGroups({
  groups,
  activeFilters,
  itemOrderMode,
  interactionDisabled,
  reorderEnabled,
  showHandleSlot,
}: {
  groups: WatchlistTimelineGroup[];
  activeFilters: WatchlistDetailQueryFilters;
  itemOrderMode: WatchlistItemOrderMode;
  interactionDisabled: boolean;
  reorderEnabled: boolean;
  showHandleSlot: boolean;
}) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <TimelineGroupSection
          key={group.year}
          group={group}
          activeFilters={activeFilters}
          itemOrderMode={itemOrderMode}
          interactionDisabled={interactionDisabled}
          reorderEnabled={reorderEnabled}
          showHandleSlot={showHandleSlot}
        />
      ))}
    </div>
  );
}

function TimelineGroupSection({
  group,
  activeFilters,
  itemOrderMode,
  interactionDisabled,
  reorderEnabled,
  showHandleSlot,
}: {
  group: WatchlistTimelineGroup;
  activeFilters: WatchlistDetailQueryFilters;
  itemOrderMode: WatchlistItemOrderMode;
  interactionDisabled: boolean;
  reorderEnabled: boolean;
  showHandleSlot: boolean;
}) {
  const releaseMode = itemOrderMode === "release";

  return (
    <div className="relative">
      {releaseMode ? <TimelineYearHeader year={group.year} /> : null}

      <SortableContext
        items={group.items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={releaseMode ? "space-y-2 md:pl-16" : "space-y-2"}>
          {group.items.map((item) => (
            <ReorderableTimelineRow
              key={item.id}
              item={item}
              activeFilters={activeFilters}
              showHandleSlot={showHandleSlot}
              showHandle={showHandleSlot && reorderEnabled}
              interactionDisabled={interactionDisabled}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function TimelineYearHeader({ year }: { year: string }) {
  return (
    <div className="sticky top-44 z-10 mb-6 flex items-center md:top-48">
      <div className="relative flex h-8 items-center rounded-full bg-background px-4 text-xs font-bold text-foreground shadow-sm ring-1 ring-border md:ml-4">
        {year}
      </div>
    </div>
  );
}

function TimelineEndcap({
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
