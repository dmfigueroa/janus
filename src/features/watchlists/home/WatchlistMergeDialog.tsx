import { MergeWatchlistDialog } from "@/features/watchlists/merge/MergeWatchlistDialog";
import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type WatchlistMergeDialogProps = {
  allWatchlists: Awaited<ReturnType<typeof getWatchlistHome>>["allWatchlists"];
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
