import { Box, Heading } from "@chakra-ui/react";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { useWatchlistMergeSelectionContext } from "@/features/watchlists/home/WatchlistMergeSelectionContext";
import { WatchlistCollapsibleSection } from "@/features/watchlists/home/WatchlistCollapsibleSection";
import { WatchlistGrid } from "@/features/watchlists/home/WatchlistGrid";

type AllWatchlistsSectionProps = WatchlistHomeData;

export function AllWatchlistsSection({
  rotation,
  completed,
  paused,
  empty,
  allWatchlists,
}: AllWatchlistsSectionProps) {
  const mergeSelection = useWatchlistMergeSelectionContext();

  if (mergeSelection.selectionMode) {
    return (
      <Box as="section" px={6}>
        <WatchlistGrid
          watchlists={allWatchlists}
          selectionMode
          selectedIdSet={mergeSelection.selectedIdSet}
          onToggle={mergeSelection.toggleSelectedWatchlist}
          showCreateTile={false}
        />
      </Box>
    );
  }

  return (
    <Box as="section" px={6}>
      <Heading as="h2" size="xl" fontWeight="bold" letterSpacing="tight" mb={4}>
        Watchlists
      </Heading>
      <WatchlistGrid
        watchlists={rotation}
        selectionMode={false}
        selectedIdSet={mergeSelection.selectedIdSet}
        onToggle={mergeSelection.toggleSelectedWatchlist}
        showCreateTile
      />
      <WatchlistCollapsibleSection title="Completed" watchlists={completed} />
      <WatchlistCollapsibleSection title="Empty" watchlists={empty} />
      <WatchlistCollapsibleSection title="Paused" watchlists={paused} />
    </Box>
  );
}
