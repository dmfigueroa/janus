import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toaster } from "@/app/Toaster";
import type { EnrichedWatchlist } from "@/features/watchlists/components/WatchlistCard";
import { mergeWatchlists } from "./Mutation";
import {
  MergeWatchlistDialogContent,
  type MergeDestinationMode,
} from "./MergeWatchlistDialogContent";

interface MergeWatchlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedWatchlistIds: number[];
  allWatchlists: EnrichedWatchlist[];
  onSuccess?: () => void;
}

function isArrayIndex(index: number, length: number) {
  return index >= 0 && index < length;
}

function showMergeError(message: string) {
  toaster.create({ type: "error", title: message });
}

function validateNewWatchlistName(name: string) {
  if (name.trim()) return true;
  showMergeError("Please enter a name for the new watchlist");
  return false;
}

function validateTargetWatchlist(targetId: string) {
  if (targetId) return true;
  showMergeError("Please select a target watchlist");
  return false;
}

function reorderWatchlistIds(currentIds: number[], watchlistId: number, direction: "up" | "down") {
  const currentIndex = currentIds.indexOf(watchlistId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (![currentIndex, nextIndex].every((index) => isArrayIndex(index, currentIds.length))) {
    return currentIds;
  }

  const nextIds = [...currentIds];
  [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
  return nextIds;
}

export function MergeWatchlistDialog({
  open,
  onOpenChange,
  selectedWatchlistIds,
  allWatchlists,
  onSuccess,
}: MergeWatchlistDialogProps) {
  const [mode, setMode] = useState<MergeDestinationMode>("new");
  const [newName, setNewName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderedSourceWatchlistIds, setOrderedSourceWatchlistIds] = useState(selectedWatchlistIds);
  const router = useRouter();
  const mergeWatchlistsFn = useServerFn(mergeWatchlists);
  const selectedWatchlists = orderedSourceWatchlistIds.flatMap((watchlistId) => {
    const watchlist = allWatchlists.find((list) => list.id === watchlistId);
    return watchlist ? [watchlist] : [];
  });
  const hasCustomOrderedSelection = selectedWatchlists.some(
    (watchlist) => watchlist.itemOrderMode === "custom",
  );

  useEffect(() => {
    setOrderedSourceWatchlistIds(selectedWatchlistIds);
  }, [selectedWatchlistIds, open]);

  const moveSelectedWatchlist = (watchlistId: number, direction: "up" | "down") => {
    setOrderedSourceWatchlistIds((currentIds) =>
      reorderWatchlistIds(currentIds, watchlistId, direction),
    );
  };

  const mergeIntoNewWatchlist = async () => {
    if (!validateNewWatchlistName(newName)) return false;
    const result = await mergeWatchlistsFn({
      data: {
        sourceWatchlistIds: orderedSourceWatchlistIds,
        target: { kind: "new", name: newName },
      },
    });
    if (!result.success) showMergeError(result.message);
    return result.success;
  };

  const mergeIntoExistingWatchlist = async () => {
    if (!validateTargetWatchlist(targetId)) return false;
    const result = await mergeWatchlistsFn({
      data: {
        sourceWatchlistIds: orderedSourceWatchlistIds,
        target: { kind: "existing", watchlistId: parseInt(targetId, 10) },
      },
    });
    if (!result.success) showMergeError(result.message);
    return result.success;
  };

  const submitMerge = () => {
    if (mode === "new") return mergeIntoNewWatchlist();
    return mergeIntoExistingWatchlist();
  };

  const completeMerge = async () => {
    toaster.create({ type: "success", title: "Watchlists merged successfully" });
    await router.invalidate?.();
    onSuccess?.();
    onOpenChange(false);
    setNewName("");
    setTargetId("");
    setMode("new");
    setOrderedSourceWatchlistIds(selectedWatchlistIds);
  };

  const handleMerge = () => {
    setIsSubmitting(true);
    void submitMerge()
      .then((success) => {
        if (success) return completeMerge();
        return undefined;
      })
      .catch((error) => {
        console.error(error);
        showMergeError("Failed to merge watchlists");
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <MergeWatchlistDialogContent
      open={open}
      onOpenChange={onOpenChange}
      selectedCount={selectedWatchlistIds.length}
      selectedWatchlists={selectedWatchlists}
      hasCustomOrderedSelection={hasCustomOrderedSelection}
      isSubmitting={isSubmitting}
      mode={mode}
      newName={newName}
      targetId={targetId}
      onMove={moveSelectedWatchlist}
      onModeChange={setMode}
      onNewNameChange={setNewName}
      onTargetChange={setTargetId}
      onCancel={() => onOpenChange(false)}
      onMerge={handleMerge}
    />
  );
}
