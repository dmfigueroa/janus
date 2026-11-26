import { Box, Container } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { AllWatchlistsSection } from "@/features/watchlists/home/AllWatchlistsSection";
import { CreateWatchlistFloatingButton } from "@/features/watchlists/home/CreateWatchlistFloatingButton";
import { HomeHeader } from "@/features/watchlists/home/HomeHeader";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import {
  useWatchlistHomeData,
  watchlistHomeQueryOptions,
} from "@/features/watchlists/home/useWatchlistHomeData";
import { WatchlistMergeDialog } from "@/features/watchlists/home/WatchlistMergeDialog";
import {
  useWatchlistMergeSelectionContext,
  WatchlistMergeSelectionProvider,
} from "@/features/watchlists/home/WatchlistMergeSelectionContext";

export const Route = createFileRoute("/watchlists/")({
  headers: () => ({ "Cache-Control": "private, no-cache" }),
  component: IndexRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      ...watchlistHomeQueryOptions(),
      revalidateIfStale: true,
    }),
});

function IndexRoute() {
  const { data } = useWatchlistHomeData();

  return <WatchlistsHomeRouteContent initialData={data} />;
}

type WatchlistsHomeRouteContentProps = {
  initialData: WatchlistHomeData;
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
