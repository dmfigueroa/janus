import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import {
  MergeWatchlistDialogContent,
  type MergeDestinationMode,
} from "@/features/watchlists/merge/MergeWatchlistDialogContent";
import { mergeWatchlists } from "@/features/watchlists/merge/Mutation";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { EnrichedWatchlist } from "./WatchlistCard";

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

function validateNewWatchlistName(name: string) {
  if (name.trim()) return true;
  toast.error("Please enter a name for the new watchlist");
  return false;
}

function validateTargetWatchlist(targetId: string) {
  if (targetId) return true;
  toast.error("Please select a target watchlist");
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
  const [targetId, setTargetId] = useState<string>("");
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
        newWatchlistName: newName,
      },
    });
    if (!result.success) toast.error(result.message);
    return result.success;
  };

  const mergeIntoExistingWatchlist = async () => {
    if (!validateTargetWatchlist(targetId)) return false;
    const result = await mergeWatchlistsFn({
      data: {
        sourceWatchlistIds: orderedSourceWatchlistIds,
        targetWatchlistId: parseInt(targetId, 10),
      },
    });
    if (!result.success) toast.error(result.message);
    return result.success;
  };

  const submitMerge = () => {
    if (mode === "new") return mergeIntoNewWatchlist();
    return mergeIntoExistingWatchlist();
  };

  const completeMerge = async () => {
    toast.success("Watchlists merged successfully");
    await router.invalidate?.();
    onSuccess?.();
    onOpenChange(false);
    // Reset state
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
        toast.error("Failed to merge watchlists");
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <MergeWatchlistDialogContent
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
    </Dialog>
  );
}
