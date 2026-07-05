import { useMemo, useState } from "react";

export function useWatchlistMergeSelection() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const enterSelectionMode = () => {
    setSelectionMode(true);
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelectedWatchlist = (watchlistId: number) => {
    setSelectedIds((currentIds) =>
      currentIds.includes(watchlistId)
        ? currentIds.filter((selectedId) => selectedId !== watchlistId)
        : [...currentIds, watchlistId],
    );
  };

  const openMergeDialog = () => {
    setMergeDialogOpen(true);
  };

  const handleMergeSuccess = () => {
    clearSelection();
  };

  return {
    selectionMode,
    selectedIds,
    selectedIdSet,
    mergeDialogOpen,
    setMergeDialogOpen,
    enterSelectionMode,
    clearSelection,
    toggleSelectedWatchlist,
    openMergeDialog,
    handleMergeSuccess,
  };
}
