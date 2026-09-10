import { Box, SimpleGrid } from "@chakra-ui/react";
import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { CreateWatchlistTile } from "@/features/watchlists/home/CreateWatchlistTile";

type WatchlistGridProps = {
  watchlists: WatchlistSummary[];
  selectionMode: boolean;
  selectedIdSet: Set<number>;
  onToggle: (watchlistId: number) => void;
  showCreateTile: boolean;
};

export function WatchlistGrid({
  watchlists,
  selectionMode,
  selectedIdSet,
  onToggle,
  showCreateTile,
}: WatchlistGridProps) {
  const gridItems = watchlists.map((watchlist) => ({
    watchlist,
    selectionMode,
    isSelected: selectedIdSet.has(watchlist.id),
    onToggle: () => onToggle(watchlist.id),
  }));

  return (
    <SimpleGrid columns={{ base: 3, md: 4 }} gap={{ base: 4, md: 6 }}>
      <WatchlistGridItems gridItems={gridItems} />
      {showCreateTile ? <CreateWatchlistTile key="create-watchlist" /> : null}
    </SimpleGrid>
  );
}

type WatchlistGridItemProps = {
  watchlist: WatchlistSummary;
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
};

type WatchlistGridItemsProps = {
  gridItems: Array<WatchlistGridItemProps>;
};

function WatchlistGridItems({ gridItems }: WatchlistGridItemsProps) {
  return gridItems.map(WatchlistGridItem);
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
