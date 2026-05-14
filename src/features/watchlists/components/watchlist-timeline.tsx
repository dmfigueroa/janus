import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  reorderVisibleItemsByAnchor,
  resolveReorderIntent,
  type ReorderIntent,
} from "@/features/watchlists/detail/reorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { Flag, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DragOverlayTimelineRow, ReorderableTimelineRow } from "./reorderable-timeline-row";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
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
  itemOrderMode,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder = false,
  interactionDisabled = false,
  reorderFailed = false,
  onReorder,
}: WatchlistTimelineProps) {
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [localOrderIds, setLocalOrderIds] = useState<number[] | null>(null);
  const reorderEnabled = canReorder && Boolean(onReorder);
  const showHandleSlot = itemOrderMode === "custom";
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const displayedItems = useMemo(
    () => (localOrderIds ? reorderItemsByIds(items, localOrderIds) : items),
    [items, localOrderIds],
  );
  const activeItem =
    activeItemId === null
      ? null
      : (displayedItems.find((item) => item.id === activeItemId) ?? null);

  useEffect(() => {
    if (itemOrderMode !== "custom") {
      setLocalOrderIds(null);
      return;
    }

    if (!localOrderIds) {
      return;
    }

    if (areItemIdsEqual(itemIds, localOrderIds) || !haveSameItemSet(itemIds, localOrderIds)) {
      setLocalOrderIds(null);
    }
  }, [itemIds, itemOrderMode, localOrderIds]);

  useEffect(() => {
    if (reorderFailed) {
      setLocalOrderIds(null);
    }
  }, [reorderFailed]);

  const groups = useMemo(() => {
    if (itemOrderMode === "custom") {
      return [{ year: "custom", items: displayedItems }];
    }

    const grouped: { year: string; items: WatchlistItem[] }[] = [];
    let currentYear = "";
    let currentGroup: WatchlistItem[] = [];

    displayedItems.forEach((item) => {
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
  }, [displayedItems, itemOrderMode]);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
  );

  const { ref } = useIntersectionObserver({
    onIntersect: interactionDisabled ? undefined : onLoadMore,
    enabled: Boolean(onLoadMore && hasMore && !isLoadingMore && !interactionDisabled),
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

  function clearDragState() {
    setActiveItemId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled || !event.over || activeItemId === null) {
      clearDragState();
      return;
    }

    const referenceItemId = Number(event.over.id);
    const movedIndex = displayedItems.findIndex((item) => item.id === activeItemId);
    const referenceIndex = displayedItems.findIndex((item) => item.id === referenceItemId);
    const position = movedIndex < referenceIndex ? "after" : "before";
    const nextItemIds = reorderVisibleItemsByAnchor({
      items: displayedItems,
      movedItemId: activeItemId,
      referenceItemId,
      position,
    });
    const intent = resolveReorderIntent({
      items: displayedItems,
      movedItemId: activeItemId,
      referenceItemId,
      position,
    });

    if (intent && nextItemIds) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setLocalOrderIds(nextItemIds);
      setActiveItemId(null);
      onReorder?.(intent);
      return;
    }

    clearDragState();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={(event) => {
        setActiveItemId(Number(event.active.id));
      }}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
    >
      <DragOverlay>
        {activeItem ? (
          <DragOverlayTimelineRow item={activeItem} interactionDisabled={interactionDisabled} />
        ) : null}
      </DragOverlay>

      <div className="relative pl-6 md:pl-0" style={{ overflowAnchor: "none" }}>
        {itemOrderMode === "release" ? (
          <>
            <div className="absolute bottom-12 left-[26px] top-6 w-[2px] bg-border md:hidden" />
            <div className="absolute bottom-12 left-8 top-0 hidden w-[2px] bg-border md:block" />
          </>
        ) : null}

        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.year} className="relative">
              {itemOrderMode === "release" ? (
                <div className="sticky top-44 z-10 mb-6 flex items-center md:top-48">
                  <div className="relative flex h-8 items-center rounded-full bg-background px-4 text-xs font-bold text-foreground shadow-sm ring-1 ring-border md:ml-4">
                    {group.year}
                  </div>
                </div>
              ) : null}

              <SortableContext
                items={group.items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className={itemOrderMode === "release" ? "space-y-2 md:pl-16" : "space-y-2"}>
                  {group.items.map((item) => (
                    <ReorderableTimelineRow
                      key={item.id}
                      item={item}
                      showHandleSlot={showHandleSlot}
                      showHandle={showHandleSlot && reorderEnabled}
                      interactionDisabled={interactionDisabled}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

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
    </DndContext>
  );
}

function reorderItemsByIds(items: WatchlistItem[], itemIds: number[]) {
  if (
    areItemIdsEqual(
      items.map((item) => item.id),
      itemIds,
    )
  ) {
    return items;
  }

  const rankByItemId = new Map(itemIds.map((itemId, index) => [itemId, index]));
  const originalIndexByItemId = new Map(items.map((item, index) => [item.id, index]));

  return [...items].sort((left, right) => {
    const leftRank = rankByItemId.get(left.id);
    const rightRank = rankByItemId.get(right.id);

    if (leftRank === undefined && rightRank === undefined) {
      return (originalIndexByItemId.get(left.id) ?? 0) - (originalIndexByItemId.get(right.id) ?? 0);
    }

    if (leftRank === undefined) {
      return 1;
    }

    if (rightRank === undefined) {
      return -1;
    }

    return leftRank - rightRank;
  });
}

function areItemIdsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}

function haveSameItemSet(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);
  return left.every((itemId) => rightIds.has(itemId));
}
