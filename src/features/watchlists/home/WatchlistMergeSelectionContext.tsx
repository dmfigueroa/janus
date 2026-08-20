import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type WatchlistMergeSelection = {
  selectionMode: boolean;
  selectedIds: number[];
  selectedIdSet: Set<number>;
  mergeDialogOpen: boolean;
  setMergeDialogOpen: (open: boolean) => void;
  enterSelectionMode: () => void;
  clearSelection: () => void;
  toggleSelectedWatchlist: (watchlistId: number) => void;
  openMergeDialog: () => void;
  handleMergeSuccess: () => void;
};

const WatchlistMergeSelectionContext = createContext<WatchlistMergeSelection | null>(null);

type WatchlistMergeSelectionProviderProps = {
  children: ReactNode;
};

export function WatchlistMergeSelectionProvider({
  children,
}: WatchlistMergeSelectionProviderProps) {
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

  const mergeSelection = {
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

  return (
    <WatchlistMergeSelectionContext.Provider value={mergeSelection}>
      {children}
    </WatchlistMergeSelectionContext.Provider>
  );
}

export function useWatchlistMergeSelectionContext() {
  const mergeSelection = useContext(WatchlistMergeSelectionContext);
  if (!mergeSelection) {
    throw new Error(
      "useWatchlistMergeSelectionContext must be used inside WatchlistMergeSelectionProvider",
    );
  }

  return mergeSelection;
}
