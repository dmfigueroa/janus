import { useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toaster } from "@/app/Toaster";
import type { WatchlistSummary } from "../list/Query";
import { formatNextItemDetail } from "../NextItemLabel";
import { rotateWatchlistCard, undoWatchlistCard, type CardRotationReceipt } from "./CardRotation";

let rotationPending = false;
const listeners = new Set<() => void>();
function setPending(value: boolean) {
  rotationPending = value;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCardRotation(watchlist: WatchlistSummary) {
  const pending = useSyncExternalStore(
    subscribe,
    () => rotationPending,
    () => false,
  );
  const rotate = useServerFn(rotateWatchlistCard);
  const undo = useServerFn(undoWatchlistCard);
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    await router.invalidate();
  };
  const undoAction = async (receipt: CardRotationReceipt) => {
    await waitForRotation();
    setPending(true);
    try {
      const result = await undo({ data: receipt });
      showUndoResult(result);
      await refresh();
    } catch {
      toaster.create({ type: "error", title: "Could not undo. Please try again." });
    } finally {
      setPending(false);
    }
  };
  const perform = async (action: "watched" | "skip") => {
    const item = watchlist.stats.nextUnwatched;
    if (!canSubmit(item)) return;
    setPending(true);
    try {
      const result = await rotate({ data: { watchlistId: watchlist.id, itemId: item.id, action } });
      showRotationResult(result, watchlist, () => {
        if (result.success) void undoAction(result.receipt);
      });
      await refresh();
    } catch {
      toaster.create({ type: "error", title: "Could not update watchlist. Please try again." });
    } finally {
      // Keep the submitted card disabled briefly after the grid settles.
      setTimeout(() => {
        setPending(false);
      }, 600);
    }
  };
  return { pending, perform };
}

function canSubmit(
  item: WatchlistSummary["stats"]["nextUnwatched"],
): item is NonNullable<WatchlistSummary["stats"]["nextUnwatched"]> {
  return !rotationPending && item !== null;
}
function showRotationResult(
  result: Awaited<ReturnType<typeof rotateWatchlistCard>>,
  watchlist: WatchlistSummary,
  onUndo: () => void,
) {
  if (!result.success) {
    toaster.create({ type: "error", title: result.message });
    return;
  }
  const title =
    result.receipt.action === "watched"
      ? `Marked ${formatNextItemDetail(watchlist.stats.nextUnwatched!)} watched`
      : `${watchlist.name} moved to back of rotation`;
  toaster.create({
    type: "success",
    title,
    duration: 8000,
    action: { label: "Undo", onClick: onUndo },
  });
}

function showUndoResult(result: { success: boolean; message?: string }) {
  if (!result.success) {
    toaster.create({ type: "error", title: result.message });
    return;
  }
  toaster.create({ type: "success", title: "Action undone" });
}

function waitForRotation(): Promise<void> {
  if (!rotationPending) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = subscribe(() => {
      if (rotationPending) return;
      unsubscribe();
      resolve();
    });
  });
}
