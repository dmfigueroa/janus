import {
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { resolveReorderIntent, type ReorderIntent } from "@/features/watchlists/detail/Reorder";

interface UseWatchlistTimelineReorderOptions {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

export function useWatchlistTimelineReorder({
  items,
  itemOrderMode,
  canReorder,
  onReorder,
}: UseWatchlistTimelineReorderOptions) {
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const reorderEnabled = isReorderEnabled(canReorder && itemOrderMode === "custom", onReorder);
  const displayedItems = items;
  const activeItem = findActiveItem(items, activeItemId);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    if (reorderEnabled) setActiveItemId(Number(event.active.id));
  }

  function handleDragCancel() {
    setActiveItemId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled) {
      handleDragCancel();
      return;
    }

    const attempt = buildDragEventReorderAttempt(displayedItems, activeItemId, event);

    if (!attempt) {
      handleDragCancel();
      return;
    }

    blurActiveElement();
    setActiveItemId(null);
    notifyReorder(onReorder, attempt);
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

function isReorderEnabled(
  canReorder: boolean,
  onReorder: UseWatchlistTimelineReorderOptions["onReorder"],
) {
  return canReorder && Boolean(onReorder);
}

function findActiveItem(items: WatchlistItem[], activeItemId: number | null) {
  if (activeItemId === null) {
    return null;
  }

  return items.find((item) => item.id === activeItemId) ?? null;
}

function buildDragEventReorderAttempt(
  items: WatchlistItem[],
  activeItemId: number | null,
  event: DragEndEvent,
) {
  if (activeItemId === null) {
    return null;
  }

  if (!event.over) {
    return null;
  }

  return buildReorderAttempt(items, activeItemId, Number(event.over.id));
}

function notifyReorder(
  onReorder: UseWatchlistTimelineReorderOptions["onReorder"],
  intent: ReorderIntent,
) {
  onReorder?.(intent);
}

function buildReorderAttempt(items: WatchlistItem[], movedItemId: number, referenceItemId: number) {
  const movedIndex = items.findIndex((item) => item.id === movedItemId);
  const referenceIndex = items.findIndex((item) => item.id === referenceItemId);
  const indexes = getValidReorderIndexes(movedIndex, referenceIndex);
  if (!indexes) return null;

  const position = getReorderPosition(indexes.moved, indexes.reference);
  const intent = resolveReorderIntent({
    items,
    movedItemId,
    referenceItemId,
    position,
  });

  if (!intent) {
    return null;
  }

  return intent;
}

function getValidReorderIndexes(moved: number, reference: number) {
  if (moved < 0) return null;
  if (reference < 0) return null;
  return { moved, reference };
}

function getReorderPosition(movedIndex: number, referenceIndex: number) {
  return movedIndex < referenceIndex ? ("after" as const) : ("before" as const);
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
