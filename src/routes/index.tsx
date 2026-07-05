import { createFileRoute } from "@tanstack/react-router";
import { AllWatchlistsSection } from "@/features/watchlists/home/all-watchlists-section";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/create-watchlist-floating-button";
import { FeaturedMediaSections } from "@/features/watchlists/home/featured-media-sections";
import { HomeHeader } from "@/features/watchlists/home/home-header";
import {
  getWatchlistHomeData,
  type WatchlistHomeQueryData,
} from "@/features/watchlists/home/query";
import { WatchlistMergeDialog } from "@/features/watchlists/home/watchlist-merge-dialog";
import {
  useWatchlistMergeSelectionContext,
  WatchlistMergeSelectionProvider,
} from "@/features/watchlists/home/watchlist-merge-selection-context";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader: async () => await getWatchlistHomeData(),
});

function IndexRoute() {
  const home = Route.useLoaderData();

  return <WatchlistsHomeRouteContent initialData={home} />;
}

type WatchlistsHomeRouteContentProps = {
  initialData: WatchlistHomeQueryData;
};

export function WatchlistsHomeRouteContent({ initialData }: WatchlistsHomeRouteContentProps) {
  return (
    <WatchlistMergeSelectionProvider>
      <WatchlistsHomeLayout initialData={initialData} />
    </WatchlistMergeSelectionProvider>
  );
}

function WatchlistsHomeLayout({ initialData }: WatchlistsHomeRouteContentProps) {
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
