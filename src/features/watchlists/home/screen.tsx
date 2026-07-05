import { MergeWatchlistDialog } from "@/components/MergeWatchlistDialog";
import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { AllWatchlistsSection } from "@/features/watchlists/home/all-watchlists-section";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/create-watchlist-floating-button";
import { FeaturedMediaSections } from "@/features/watchlists/home/featured-media-sections";
import { HomeHeader } from "@/features/watchlists/home/home-header";
import { useWatchlistMergeSelection } from "@/features/watchlists/home/use-watchlist-merge-selection";

type WatchlistsHomeScreenProps = {
  initialData: WatchlistHomeQueryData;
};

export function WatchlistsHomeScreen({ initialData }: WatchlistsHomeScreenProps) {
  const mergeSelection = useWatchlistMergeSelection();

  return (
    <div className="min-h-screen bg-background pb-24 font-sans text-foreground">
      <div className="container relative mx-auto min-h-screen">
        <HomeHeader
          totals={initialData.totals}
          selectionMode={mergeSelection.selectionMode}
          selectedCount={mergeSelection.selectedIds.length}
          onEnterSelectionMode={mergeSelection.enterSelectionMode}
          onCancelSelection={mergeSelection.clearSelection}
          onOpenMergeDialog={mergeSelection.openMergeDialog}
        />

        {!mergeSelection.selectionMode ? (
          <FeaturedMediaSections sections={initialData.featuredSections} />
        ) : null}

        <AllWatchlistsSection
          watchlists={initialData.allWatchlists}
          selectionMode={mergeSelection.selectionMode}
          selectedIdSet={mergeSelection.selectedIdSet}
          onToggleSelectedWatchlist={mergeSelection.toggleSelectedWatchlist}
        />

        {!mergeSelection.selectionMode ? <CreateWatchlistFloatingButton /> : null}

        <MergeWatchlistDialog
          open={mergeSelection.mergeDialogOpen}
          onOpenChange={mergeSelection.setMergeDialogOpen}
          selectedWatchlistIds={mergeSelection.selectedIds}
          allWatchlists={initialData.allWatchlists}
          onSuccess={mergeSelection.handleMergeSuccess}
        />
      </div>
    </div>
  );
}
