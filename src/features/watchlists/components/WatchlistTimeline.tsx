import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Flex, Text } from "@chakra-ui/react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import type { WatchlistReorder } from "@/features/watchlists/detail/useWatchlistReorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useCallback, useMemo, useState } from "react";
import { DragOverlayTimelineRow } from "./DragOverlayTimelineRow";
import { WatchlistTimelineVirtualList } from "./WatchlistTimelineVirtualList";

import { WatchlistTimelineEndcap } from "./WatchlistTimelineEndcap";
import { buildWatchlistTimelineBlocks } from "./WatchlistTimeline.model";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  unwatchedOnly: boolean;
  itemOrderMode: WatchlistItemOrderMode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  reorder?: WatchlistReorder;
  interactionDisabled?: boolean;
}

export function WatchlistTimeline(props: WatchlistTimelineProps) {
  const { items, itemOrderMode, unwatchedOnly, onLoadMore } = props;
  const reorder = props.reorder ?? readOnlyReorder(items);
  const displayedItems = reorder.displayedItems;
  const { expandedRunKeys, toggleRun } = useExpandedWatchedRuns();
  const blocks = useMemo(
    () =>
      buildWatchlistTimelineBlocks({
        items: displayedItems,
        itemOrderMode,
        unwatchedOnly,
        expandedRunKeys,
      }),
    [displayedItems, itemOrderMode, unwatchedOnly, expandedRunKeys],
  );
  const sortableItemIds = useMemo(() => displayedItems.map((item) => item.id), [displayedItems]);
  const { ref } = useIntersectionObserver({
    onIntersect: getLoadMoreHandler(Boolean(props.interactionDisabled), onLoadMore),
    enabled: isLoadMoreEnabled(props),
    rootMargin: "100px",
  });

  if (items.length === 0) return <EmptyWatchlistState />;

  return (
    <DndContext
      sensors={reorder.sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={reorder.handleDragStart}
      onDragCancel={reorder.handleDragCancel}
      onDragEnd={reorder.handleDragEnd}
      cancelDrop={reorder.prepareDrop}
    >
      {/* Saving updates the cache asynchronously. The default drop animation measures
          the old row position and can fly back there before the new order renders. */}
      <DragOverlay dropAnimation={null}>
        <TimelineDragOverlayItem item={reorder.activeItem} itemOrderMode={itemOrderMode} />
      </DragOverlay>

      <SortableContext items={sortableItemIds} strategy={verticalListSortingStrategy}>
        <WatchlistTimelineVirtualList
          blocks={blocks}
          itemOrderMode={itemOrderMode}
          showHandleSlot={itemOrderMode === "custom"}
          showHandle={resolveShowHandle(itemOrderMode, reorder.reorderEnabled)}
          interactionDisabled={Boolean(props.interactionDisabled)}
          onToggleRun={toggleRun}
        />
      </SortableContext>
      <WatchlistTimelineEndcap hasMore={props.hasMore} sentinelRef={ref} />
    </DndContext>
  );
}

function TimelineDragOverlayItem({
  item,
  itemOrderMode,
}: {
  item: WatchlistItem | null;
  itemOrderMode: WatchlistItemOrderMode;
}) {
  if (!item) return null;
  return <DragOverlayTimelineRow item={item} itemOrderMode={itemOrderMode} />;
}

function resolveShowHandle(itemOrderMode: WatchlistItemOrderMode, reorderEnabled: boolean) {
  return itemOrderMode === "custom" && reorderEnabled;
}

function useExpandedWatchedRuns() {
  const [expandedRunKeys, setExpandedRunKeys] = useState<ReadonlySet<string>>(() => new Set());
  const toggleRun = useCallback((runKey: string) => {
    setExpandedRunKeys((current) => toggleSetKey(current, runKey));
  }, []);

  return { expandedRunKeys, toggleRun };
}

function toggleSetKey(current: ReadonlySet<string>, key: string) {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
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

function EmptyWatchlistState() {
  return (
    <Flex
      h={64}
      direction="column"
      align="center"
      justify="center"
      textAlign="center"
      color="fg.muted"
      opacity={0.6}
    >
      <Text>No items in this watchlist yet.</Text>
      <Text fontSize="sm">Add movies and shows from the Search page.</Text>
    </Flex>
  );
}

function readOnlyReorder(items: WatchlistItem[]) {
  return {
    displayedItems: items,
    activeItem: null,
    reorderEnabled: false,
    sensors: undefined,
    handleDragStart: undefined,
    handleDragCancel: undefined,
    handleDragEnd: undefined,
    prepareDrop: undefined,
  };
}
