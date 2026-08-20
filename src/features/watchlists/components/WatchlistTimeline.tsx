import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailQueryFilters } from "@/features/watchlists/detail/Query";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { ReorderIntent } from "@/features/watchlists/detail/Reorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useMemo } from "react";
import { DragOverlayTimelineRow, ReorderableTimelineRow } from "./ReorderableTimelineRow";
import { useWatchlistTimelineReorder } from "./useWatchlistTimelineReorder";
import { WatchlistTimelineEndcap } from "./WatchlistTimelineEndcap";
import {
  buildWatchlistTimelineGroups,
  type WatchlistTimelineGroup,
} from "./WatchlistTimeline.model";

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

export function WatchlistTimeline(props: WatchlistTimelineProps) {
  const { items, itemOrderMode, onLoadMore, onReorder } = props;
  const reorder = useWatchlistTimelineReorder({
    items,
    itemOrderMode,
    canReorder: Boolean(props.canReorder),
    reorderFailed: Boolean(props.reorderFailed),
    onReorder,
  });
  const groups = useMemo(
    () => buildWatchlistTimelineGroups(reorder.displayedItems, itemOrderMode),
    [reorder.displayedItems, itemOrderMode],
  );
  const { ref } = useIntersectionObserver({
    onIntersect: getLoadMoreHandler(Boolean(props.interactionDisabled), onLoadMore),
    enabled: isLoadMoreEnabled(props),
    rootMargin: "100px",
  });

  return <WatchlistTimelineContent props={props} reorder={reorder} groups={groups} ref={ref} />;
}

const getLoadMoreHandler = (interactionDisabled: boolean, onLoadMore: (() => void) | undefined) =>
  interactionDisabled ? undefined : onLoadMore;

function isLoadMoreEnabled({
  onLoadMore,
  hasMore,
  isLoadingMore,
  interactionDisabled,
}: Pick<
  WatchlistTimelineProps,
  "onLoadMore" | "hasMore" | "isLoadingMore" | "interactionDisabled"
>) {
  if (!onLoadMore) return false;
  if (!hasMore) return false;
  return isTimelineInteractionReady(isLoadingMore, interactionDisabled);
}

const isTimelineInteractionReady = (isLoadingMore?: boolean, interactionDisabled?: boolean) =>
  !isLoadingMore && !interactionDisabled;

function WatchlistTimelineContent({
  props,
  reorder,
  groups,
  ref,
}: {
  props: WatchlistTimelineProps;
  reorder: ReturnType<typeof useWatchlistTimelineReorder>;
  groups: WatchlistTimelineGroup[];
  ref: ReturnType<typeof useIntersectionObserver>["ref"];
}) {
  if (props.items.length === 0) return <EmptyWatchlistState />;
  const showHandleSlot = props.itemOrderMode === "custom";

  return (
    <DndContext
      sensors={reorder.sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={reorder.handleDragStart}
      onDragCancel={reorder.handleDragCancel}
      onDragEnd={reorder.handleDragEnd}
    >
      <DragOverlay>
        {reorder.activeItem ? (
          <DragOverlayTimelineRow
            item={reorder.activeItem}
            interactionDisabled={Boolean(props.interactionDisabled)}
          />
        ) : null}
      </DragOverlay>

      <div className="relative pl-6 md:pl-0" style={{ overflowAnchor: "none" }}>
        <ReleaseTimelineDecorations itemOrderMode={props.itemOrderMode} />
        <div className="space-y-8">
          {groups.map((group) => (
            <TimelineGroupSection
              key={group.year}
              group={group}
              activeFilters={props.activeFilters}
              itemOrderMode={props.itemOrderMode}
              interactionDisabled={Boolean(props.interactionDisabled)}
              reorderEnabled={reorder.reorderEnabled}
              showHandleSlot={showHandleSlot}
            />
          ))}
        </div>
        <WatchlistTimelineEndcap hasMore={props.hasMore} sentinelRef={ref} />
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
