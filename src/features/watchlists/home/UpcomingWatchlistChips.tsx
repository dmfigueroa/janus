import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { UpcomingWatchlistChip } from "@/features/watchlists/home/UpcomingWatchlistChip";

type UpcomingWatchlistChipsProps = {
  watchlists: Awaited<WatchlistHomeData>["featuredSections"][number]["upcomingWatchlists"];
};

export function UpcomingWatchlistChips({ watchlists }: UpcomingWatchlistChipsProps) {
  if (watchlists.length === 0) {
    return null;
  }

  return (
    <Box mt={4} borderTopWidth="1px" borderColor="border.default" pt={3}>
      <Text mb={2} fontSize="sm" fontWeight="medium" color="fg.muted">
        Coming up after these
      </Text>
      <Flex wrap="wrap" gap={2}>
        <UpcomingWatchlistChipItems watchlists={watchlists} />
      </Flex>
    </Box>
  );
}

function UpcomingWatchlistChipItems({ watchlists }: UpcomingWatchlistChipsProps) {
  return watchlists.map(UpcomingWatchlistChipItem);
}

function UpcomingWatchlistChipItem(watchlist: UpcomingWatchlistChipsProps["watchlists"][number]) {
  return <UpcomingWatchlistChip key={watchlist.id} watchlist={watchlist} />;
}
import { Box, Flex, Text } from "@chakra-ui/react";
