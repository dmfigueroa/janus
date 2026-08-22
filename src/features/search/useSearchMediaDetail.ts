import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { UnifiedMedia } from "@/server/Media";
import {
  addToWatchlist,
  type AddToWatchlistInsertionPosition,
} from "@/features/watchlists/add/Mutation";
import { getWatchlistList, watchlistListQueryKey } from "@/features/watchlists/list/Query";

const watchlistSelectorFilters = { orderBy: "lastAdded" } as const;

function requiresCustomInsertion(
  watchlists: Awaited<ReturnType<typeof getWatchlistList>> | undefined,
  selectedWatchlistId: string,
) {
  if (!watchlists) return false;
  return (
    watchlists.find((watchlist) => watchlist.id.toString() === selectedWatchlistId)
      ?.itemOrderMode === "custom"
  );
}

function getInsertionPosition(
  required: boolean,
  insertionPosition: AddToWatchlistInsertionPosition | "",
) {
  if (!required) return undefined;
  return insertionPosition || undefined;
}

function getAddFailureMessage(data: { message?: string } | undefined) {
  return data?.message || "Failed to add to watchlist";
}

function validateSelectedWatchlist(selectedWatchlistId: string) {
  if (selectedWatchlistId) return true;
  toaster.create({ type: "error", title: "Please select a watchlist" });
  return false;
}

function validateInsertionPosition(
  required: boolean,
  insertionPosition: AddToWatchlistInsertionPosition | "",
) {
  if (required && !insertionPosition) {
    toaster.create({
      type: "error",
      title: "Choose where to insert this item in the custom order.",
    });
    return false;
  }
  return true;
}

export function useSearchMediaDetail({
  media,
  isOpen,
  onClose,
}: {
  media: UnifiedMedia | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [insertionPosition, setInsertionPosition] = useState<AddToWatchlistInsertionPosition | "">(
    "",
  );
  const getWatchlistListFn = useServerFn(getWatchlistList);
  const addToWatchlistFn = useServerFn(addToWatchlist);
  const { data: watchlists } = useQuery({
    queryKey: watchlistListQueryKey(watchlistSelectorFilters),
    queryFn: () => getWatchlistListFn({ data: watchlistSelectorFilters }),
    enabled: isOpen,
  });
  const requiresInsertionChoice = requiresCustomInsertion(watchlists, selectedWatchlistId);

  useEffect(() => {
    setInsertionPosition("");
  }, [selectedWatchlistId]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!media || !selectedWatchlistId) return undefined;
      return addToWatchlistFn({
        data: {
          watchlistId: Number.parseInt(selectedWatchlistId, 10),
          media,
          insertionPosition: getInsertionPosition(requiresInsertionChoice, insertionPosition),
        },
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        toaster.create({ type: "success", title: data.message });
        onClose();
      } else {
        toaster.create({ type: "error", title: getAddFailureMessage(data) });
      }
    },
    onError: (error) => {
      toaster.create({ type: "error", title: "An error occurred" });
      console.error(error);
    },
  });

  const handleAddToWatchlist = () => {
    if (!validateSelectedWatchlist(selectedWatchlistId)) return;
    if (!validateInsertionPosition(requiresInsertionChoice, insertionPosition)) return;

    addToWatchlistMutation.mutate();
  };

  return {
    watchlists,
    selectedWatchlistId,
    insertionPosition,
    requiresInsertionChoice,
    isAdding: addToWatchlistMutation.isPending,
    onWatchlistSelect: setSelectedWatchlistId,
    onInsertionPositionChange: setInsertionPosition,
    onAdd: handleAddToWatchlist,
  };
}
