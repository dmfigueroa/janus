import { createContext, type ReactNode, useContext } from "react";
import { useWatchlistMergeSelection } from "@/features/watchlists/home/use-watchlist-merge-selection";

type WatchlistMergeSelection = ReturnType<typeof useWatchlistMergeSelection>;

const WatchlistMergeSelectionContext = createContext<WatchlistMergeSelection | null>(null);

type WatchlistMergeSelectionProviderProps = {
  children: ReactNode;
};

export function WatchlistMergeSelectionProvider({
  children,
}: WatchlistMergeSelectionProviderProps) {
  const mergeSelection = useWatchlistMergeSelection();

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
