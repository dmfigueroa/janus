import { Box, Heading, SimpleGrid } from "@chakra-ui/react";
import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";
import type { getWatchlistHome } from "@/features/watchlists/home/WatchlistHome";
import { CreateWatchlistTile } from "@/features/watchlists/home/CreateWatchlistTile";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";

type AllWatchlistsSectionProps = {
  watchlists: Awaited<ReturnType<typeof getWatchlistHome>>["allWatchlists"];
};

export function AllWatchlistsSection({ watchlists }: AllWatchlistsSectionProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();

  return (
    <Box as="section" px={6}>
      {!mergeSelection.selectionMode ? (
        <Heading as="h2" size="xl" fontWeight="bold" letterSpacing="tight" mb={4}>
          All Watchlists
        </Heading>
      ) : null}
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={{ base: 4, md: 6 }}>
        <WatchlistGridItems
          watchlists={watchlists}
          selectionMode={mergeSelection.selectionMode}
          selectedIdSet={mergeSelection.selectedIdSet}
          onToggle={mergeSelection.toggleSelectedWatchlist}
        />
      </SimpleGrid>
    </Box>
  );
}

type WatchlistGridItemProps = {
  watchlist: AllWatchlistsSectionProps["watchlists"][number];
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
};

function WatchlistGridItems({
  watchlists,
  selectionMode,
  selectedIdSet,
  onToggle,
}: {
  watchlists: AllWatchlistsSectionProps["watchlists"];
  selectionMode: boolean;
  selectedIdSet: Set<number>;
  onToggle: (watchlistId: number) => void;
}) {
  const gridItems = watchlists.map((watchlist) => ({
    watchlist,
    selectionMode,
    isSelected: selectedIdSet.has(watchlist.id),
    onToggle: () => onToggle(watchlist.id),
  }));

  return selectionMode
    ? gridItems.map(WatchlistGridItem)
    : [...gridItems.map(WatchlistGridItem), <CreateWatchlistTile key="create-watchlist" />];
}

function WatchlistGridItem({
  watchlist,
  selectionMode,
  isSelected,
  onToggle,
}: WatchlistGridItemProps) {
  return (
    <Box key={watchlist.id} w="full" maxW={{ md: "220px" }}>
      <WatchlistCard
        watchlist={watchlist}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggle={onToggle}
      />
    </Box>
  );
}
