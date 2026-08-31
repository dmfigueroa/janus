import { MergeWatchlistDialog } from "@/features/watchlists/merge/MergeWatchlistDialog";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type WatchlistMergeDialogProps = {
  allWatchlists: WatchlistHomeData["allWatchlists"];
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
