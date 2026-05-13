import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  resolveReorderIntent,
  type DropPlacement,
  type ReorderIntent,
} from "@/features/watchlists/detail/reorder";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { Flag, Loader2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DragOverlayTimelineRow, ReorderableTimelineRow } from "./reorderable-timeline-row";

interface WatchlistTimelineProps {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  canReorder?: boolean;
  interactionDisabled?: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

type DropTarget = {
  referenceItemId: number;
  position: DropPlacement;
};

type PendingDrop = {
  itemIdsBeforeDrop: number[];
  scrollTop: number;
};

export function WatchlistTimeline({
  items,
  itemOrderMode,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder = false,
  interactionDisabled = false,
  onReorder,
}: WatchlistTimelineProps) {
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const pendingDropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderEnabled = canReorder && Boolean(onReorder);
  const showHandleSlot = itemOrderMode === "custom";
  const activeItem =
    activeItemId === null ? null : (items.find((item) => item.id === activeItemId) ?? null);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useLayoutEffect(() => {
    if (!pendingDrop) {
      return;
    }

    const hasOrderChanged =
      pendingDrop.itemIdsBeforeDrop.length === itemIds.length &&
      pendingDrop.itemIdsBeforeDrop.some((itemId, index) => itemId !== itemIds[index]);

    if (!hasOrderChanged) {
      return;
    }

    if (pendingDropTimeoutRef.current) {
      clearTimeout(pendingDropTimeoutRef.current);
      pendingDropTimeoutRef.current = null;
    }
    window.scrollTo({ top: pendingDrop.scrollTop });
    setPendingDrop(null);
    setActiveItemId(null);
    setDropTarget(null);
  }, [itemIds, pendingDrop]);

  useLayoutEffect(() => {
    return () => {
      if (pendingDropTimeoutRef.current) {
        clearTimeout(pendingDropTimeoutRef.current);
      }
    };
  }, []);

  const groups = useMemo(() => {
    if (itemOrderMode === "custom") {
      return [{ year: "custom", items }];
    }

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
  }, [itemOrderMode, items]);

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
    if (pendingDropTimeoutRef.current) {
      clearTimeout(pendingDropTimeoutRef.current);
      pendingDropTimeoutRef.current = null;
    }
    setActiveItemId(null);
    setDropTarget(null);
    setPendingDrop(null);
  }

  function updateDropTarget(event: DragMoveEvent | DragOverEvent) {
    if (!reorderEnabled || !event.over) {
      setDropTarget(null);
      return;
    }

    const referenceItemId = Number(event.over.id);
    if (Number.isNaN(referenceItemId)) {
      setDropTarget(null);
      return;
    }

    const initialRect = event.active.rect.current.initial;
    if (!initialRect) {
      setDropTarget(null);
      return;
    }

    const activeTop = event.active.rect.current.translated?.top ?? initialRect.top;
    const activeHeight = event.active.rect.current.translated?.height ?? initialRect.height;
    const activeMidpoint = activeTop + activeHeight / 2;
    const overMidpoint = event.over.rect.top + event.over.rect.height / 2;

    setDropTarget({
      referenceItemId,
      position: activeMidpoint < overMidpoint ? "before" : "after",
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled || !event.over || activeItemId === null) {
      clearDragState();
      return;
    }

    const position =
      dropTarget?.referenceItemId === Number(event.over.id) ? dropTarget.position : "after";
    const intent = resolveReorderIntent({
      items,
      movedItemId: activeItemId,
      referenceItemId: Number(event.over.id),
      position,
    });

    if (intent) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setPendingDrop({
        itemIdsBeforeDrop: itemIds,
        scrollTop: window.scrollY,
      });
      pendingDropTimeoutRef.current = setTimeout(() => {
        pendingDropTimeoutRef.current = null;
        setPendingDrop(null);
        setActiveItemId(null);
        setDropTarget(null);
      }, 500);
      onReorder?.(intent);
      setDropTarget(null);
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
      onDragMove={updateDropTarget}
      onDragOver={updateDropTarget}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
    >
      <DragOverlay>
        {activeItem ? (
          <DragOverlayTimelineRow item={activeItem} interactionDisabled={interactionDisabled} />
        ) : null}
      </DragOverlay>

      <div className="relative pl-6 md:pl-0">
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
                      dropCue={
                        activeItemId === null || dropTarget?.referenceItemId !== item.id
                          ? null
                          : dropTarget.position
                      }
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
