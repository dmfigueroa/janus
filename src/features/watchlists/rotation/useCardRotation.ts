import { useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toaster } from "@/app/Toaster";
import type { WatchlistSummary } from "../list/Query";
import { formatNextItemDetail } from "../NextItemLabel";
import { rotateWatchlistCard, undoWatchlistCard } from "./CardRotation";

import { cardRotationCoordinator } from "./CardRotationCoordinator";

export function useCardRotation(watchlist: WatchlistSummary) {
  const pending = useSyncExternalStore(
    cardRotationCoordinator.subscribe,
    cardRotationCoordinator.getSnapshot,
    () => false,
  );
  const rotate = useServerFn(rotateWatchlistCard);
  const undo = useServerFn(undoWatchlistCard);
  const router = useRouter();
  const queryClient = useQueryClient();
  const perform = (action: "watched" | "skip") => {
    const item = watchlist.stats.nextUnwatched;
    if (!item) return Promise.resolve();
    const title =
      action === "watched"
        ? `Marked ${formatNextItemDetail(item)} watched`
        : `${watchlist.name} moved to back of rotation`;
    return cardRotationCoordinator.perform(
      { watchlistId: watchlist.id, itemId: item.id, action },
      title,
      {
        rotate: (input) => rotate({ data: input }),
        undo: (receipt) => undo({ data: receipt }),
        refresh: async () => {
          await queryClient.invalidateQueries({ queryKey: ["watchlists"] });
          await router.invalidate();
        },
        notify: ({ title, type, undo: onUndo }) => {
          toaster.create({
            title,
            type,
            duration: onUndo ? 8000 : undefined,
            action: onUndo ? { label: "Undo", onClick: onUndo } : undefined,
          });
        },
      },
    );
  };
  return { pending, perform };
}
