import { MergeWatchlistDialog } from "@/components/MergeWatchlistDialog";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/watchlist-merge-selection-context";

type WatchlistMergeDialogProps = {
  allWatchlists: WatchlistHomeQueryData["allWatchlists"];
};

export function WatchlistMergeDialog({ allWatchlists }: WatchlistMergeDialogProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();

  return (
    <MergeWatchlistDialog
      open={mergeSelection.mergeDialogOpen}
      onOpenChange={mergeSelection.setMergeDialogOpen}
      selectedWatchlistIds={mergeSelection.selectedIds}
      allWatchlists={allWatchlists}
      onSuccess={mergeSelection.handleMergeSuccess}
    />
  );
}
