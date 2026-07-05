import type { WatchlistHomeQueryData } from "@/features/watchlists/home/query";
import { AllWatchlistsSection } from "@/features/watchlists/home/all-watchlists-section";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/create-watchlist-floating-button";
import { FeaturedMediaSections } from "@/features/watchlists/home/featured-media-sections";
import { HomeHeader } from "@/features/watchlists/home/home-header";
import { WatchlistMergeDialog } from "@/features/watchlists/home/watchlist-merge-dialog";
import {
  useWatchlistMergeSelectionContext,
  WatchlistMergeSelectionProvider,
} from "@/features/watchlists/home/watchlist-merge-selection-context";

type WatchlistsHomeScreenProps = {
  initialData: WatchlistHomeQueryData;
};

export function WatchlistsHomeScreen({ initialData }: WatchlistsHomeScreenProps) {
  return (
    <WatchlistMergeSelectionProvider>
      <WatchlistsHomeContent initialData={initialData} />
    </WatchlistMergeSelectionProvider>
  );
}

function WatchlistsHomeContent({ initialData }: WatchlistsHomeScreenProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();

  return (
    <div className="min-h-screen bg-background pb-24 font-sans text-foreground">
      <div className="container relative mx-auto min-h-screen">
        <HomeHeader totals={initialData.totals} />

        {!mergeSelection.selectionMode ? (
          <FeaturedMediaSections sections={initialData.featuredSections} />
        ) : null}

        <AllWatchlistsSection watchlists={initialData.allWatchlists} />

        {!mergeSelection.selectionMode ? <CreateWatchlistFloatingButton /> : null}

        <WatchlistMergeDialog allWatchlists={initialData.allWatchlists} />
      </div>
    </div>
  );
}
