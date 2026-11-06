import { Box, Container } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { AllWatchlistsSection } from "@/features/watchlists/home/AllWatchlistsSection";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/CreateWatchlistFloatingButton";
import { HomeHeader } from "@/features/watchlists/home/HomeHeader";
import { getWatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { WatchlistMergeDialog } from "@/features/watchlists/home/WatchlistMergeDialog";
import {
  useWatchlistMergeSelectionContext,
  WatchlistMergeSelectionProvider,
} from "@/features/watchlists/home/WatchlistMergeSelectionContext";

export const Route = createFileRoute("/watchlists/")({
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
    <Box minH="100vh" pb={24}>
      <Container position="relative" minH="100vh" maxW="7xl">
        <HomeHeader totals={initialData.totals} />

        <AllWatchlistsSection {...initialData} />

        {!mergeSelection.selectionMode ? <CreateWatchlistFloatingButton /> : null}

        <WatchlistMergeDialog allWatchlists={initialData.allWatchlists} />
      </Container>
    </Box>
  );
}
