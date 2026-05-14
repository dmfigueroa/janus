import {
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  reorderVisibleItemsByAnchor,
  resolveReorderIntent,
  type ReorderIntent,
} from "@/features/watchlists/detail/reorder";
import { reorderItemsByIds, shouldResetOptimisticOrder } from "./watchlist-timeline.model";

interface UseWatchlistTimelineReorderOptions {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  reorderFailed: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

export function useWatchlistTimelineReorder({
  items,
  itemOrderMode,
  canReorder,
  reorderFailed,
  onReorder,
}: UseWatchlistTimelineReorderOptions) {
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [localOrderIds, setLocalOrderIds] = useState<number[] | null>(null);
  const reorderEnabled = canReorder && Boolean(onReorder);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const displayedItems = useMemo(
    () => (localOrderIds ? reorderItemsByIds(items, localOrderIds) : items),
    [items, localOrderIds],
  );
  const activeItem =
    activeItemId === null
      ? null
      : (displayedItems.find((item) => item.id === activeItemId) ?? null);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
  );

  useEffect(() => {
    if (itemOrderMode !== "custom") {
      setLocalOrderIds(null);
      return;
    }

    if (shouldResetOptimisticOrder(itemIds, localOrderIds)) {
      setLocalOrderIds(null);
    }
  }, [itemIds, itemOrderMode, localOrderIds]);

  useEffect(() => {
    if (reorderFailed) {
      setLocalOrderIds(null);
    }
  }, [reorderFailed]);

  function handleDragStart(event: DragStartEvent) {
    setActiveItemId(Number(event.active.id));
  }

  function handleDragCancel() {
    setActiveItemId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled || !event.over || activeItemId === null) {
      handleDragCancel();
      return;
    }

    const attempt = buildReorderAttempt(displayedItems, activeItemId, Number(event.over.id));

    if (!attempt) {
      handleDragCancel();
      return;
    }

    blurActiveElement();
    setLocalOrderIds(attempt.nextItemIds);
    setActiveItemId(null);
    onReorder?.(attempt.intent);
  }

  return {
    activeItem,
    displayedItems,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    reorderEnabled,
    sensors,
  };
}

function buildReorderAttempt(items: WatchlistItem[], movedItemId: number, referenceItemId: number) {
  const movedIndex = items.findIndex((item) => item.id === movedItemId);
  const referenceIndex = items.findIndex((item) => item.id === referenceItemId);

  if (movedIndex < 0 || referenceIndex < 0) {
    return null;
  }

  const position = movedIndex < referenceIndex ? "after" : "before";
  const nextItemIds = reorderVisibleItemsByAnchor({
    items,
    movedItemId,
    referenceItemId,
    position,
  });
  const intent = resolveReorderIntent({
    items,
    movedItemId,
    referenceItemId,
    position,
  });

  if (!intent || !nextItemIds) {
    return null;
  }

  return { intent, nextItemIds };
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
