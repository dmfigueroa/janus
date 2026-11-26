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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import { invalidateWatchlistReorderQueries } from "@/features/watchlists/Cache";
import {
  optimisticallyReorderWatchlistItems,
  restoreWatchlistDetailSnapshot,
} from "@/features/watchlists/detail/WatchlistDetailCache";
import {
  watchlistDetailQueryKey,
  type WatchlistDetailQueryFilters,
} from "@/features/watchlists/detail/Query";
import { reorderWatchlistItems } from "@/features/watchlists/reorder/Mutation";

function useReorderSave({
  watchlistId,
  activeFilters,
}: {
  watchlistId: number;
  activeFilters: WatchlistDetailQueryFilters;
}) {
  const queryClient = useQueryClient();
  const reorderWatchlistItemsFn = useServerFn(reorderWatchlistItems);
  const activeQueryKey = watchlistDetailQueryKey(activeFilters);

  // The query cache owns the displayed order. Pending includes reconciliation,
  // so another drag cannot race the authoritative refresh or rollback.
  const mutation = useMutation({
    mutationFn: async ({ input }: ReorderRequest) => {
      const result = await reorderWatchlistItemsFn({
        data: { watchlistId, ...input },
      });

      if (!result.success) {
        throw new Error(result.message);
      }
    },
    onMutate: async ({ input, prepared }: ReorderRequest) => {
      try {
        const snapshot = await optimisticallyReorderWatchlistItems({
          queryClient,
          watchlistId,
          activeQueryKey,
          ...input,
        });
        prepared(true);
        return snapshot;
      } catch (error) {
        prepared(false);
        throw error;
      }
    },
    onSuccess: () => {
      toaster.create({ type: "success", title: "Order saved", duration: 2000 });
    },
    onError: (error, _input, snapshot) => {
      restoreWatchlistDetailSnapshot({ queryClient, snapshot });
      toaster.create({
        type: "error",
        title: error instanceof Error ? error.message : "Failed to reorder watchlist",
      });
    },
    onSettled: () => invalidateWatchlistReorderQueries(queryClient, watchlistId),
  });

  return {
    isPending: mutation.isPending,
    prepare: (input: ReorderIntent) =>
      new Promise<boolean>((prepared) => mutation.mutate({ input, prepared })),
  };
}

type ReorderRequest = {
  input: ReorderIntent;
  prepared: (ready: boolean) => void;
};

interface ReorderDragOptions {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  onReorder: (intent: ReorderIntent) => Promise<boolean>;
}

function useReorderDrag({ items, itemOrderMode, canReorder, onReorder }: ReorderDragOptions) {
  const [drag, setDrag] = useState<{ itemId: number; items: WatchlistItem[] } | null>(null);
  const reorderEnabled = canReorder && itemOrderMode === "custom";
  // Keep the sortable input stable until drag end. A cache notification during
  // drop preparation must not apply the drag displacement to the new order.
  const { items: displayedItems, itemId: activeItemId } = drag ?? { items, itemId: null };
  const activeItem = findActiveItem(displayedItems, activeItemId);
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
    if (reorderEnabled) setDrag({ itemId: Number(event.active.id), items });
  }

  function handleDragCancel() {
    setDrag(null);
  }

  async function prepareDrop(event: DragEndEvent) {
    if (!reorderEnabled) return true;
    const attempt = buildDragEventReorderAttempt(displayedItems, activeItemId, event);
    if (!attempt) return true;

    return finishDropPreparation(onReorder, attempt);
  }

  function handleDragEnd() {
    blurActiveElement();
    setDrag(null);
  }

  return {
    activeItem,
    displayedItems,
    handleDragCancel,
    handleDragEnd,
    prepareDrop,
    handleDragStart,
    reorderEnabled,
    sensors,
  };
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

function buildReorderAttempt(items: WatchlistItem[], movedItemId: number, referenceItemId: number) {
  const movedIndex = items.findIndex((item) => item.id === movedItemId);
  const referenceIndex = items.findIndex((item) => item.id === referenceItemId);
  if ([movedIndex, referenceIndex].some((index) => index < 0)) return null;
  const position = movedIndex < referenceIndex ? "after" : "before";
  return resolveReorderIntent({
    items,
    movedItemId,
    referenceItemId,
    position,
  });
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

async function finishDropPreparation(
  onReorder: ReorderDragOptions["onReorder"],
  intent: ReorderIntent,
) {
  const prepared = await onReorder(intent);
  if (prepared === false) return true;
  // Query observers notify asynchronously. Retain the overlay until React has
  // committed the optimistic cache order before ending the drag.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return false;
}

export function useWatchlistReorder({
  items,
  itemOrderMode,
  canReorder,
  watchlistId,
  activeFilters,
}: {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  watchlistId: number;
  activeFilters: WatchlistDetailQueryFilters;
}) {
  const mutation = useReorderSave({ watchlistId, activeFilters });
  const drag = useReorderDrag({
    items,
    itemOrderMode,
    canReorder: canReorder && !mutation.isPending,
    onReorder: mutation.prepare,
  });
  return { ...drag, isPending: mutation.isPending };
}

export type WatchlistReorder = ReturnType<typeof useWatchlistReorder>;
