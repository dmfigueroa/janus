import { createFileRoute } from "@tanstack/react-router";
import { AllWatchlistsSection } from "@/features/watchlists/home/AllWatchlistsSection";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/CreateWatchlistFloatingButton";
import { FeaturedMediaSections } from "@/features/watchlists/home/FeaturedMediaSections";
import { HomeHeader } from "@/features/watchlists/home/HomeHeader";
import { getWatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { WatchlistMergeDialog } from "@/features/watchlists/home/WatchlistMergeDialog";
import {
  useWatchlistMergeSelectionContext,
  WatchlistMergeSelectionProvider,
} from "@/features/watchlists/home/WatchlistMergeSelectionContext";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  loader: async () => await getWatchlistHomeData(),
});

function IndexRoute() {
  const home = Route.useLoaderData();

  return <WatchlistsHomeRouteContent initialData={home} />;
}

type WatchlistsHomeRouteContentProps = {
  initialData: Awaited<ReturnType<typeof getWatchlistHomeData>>;
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
