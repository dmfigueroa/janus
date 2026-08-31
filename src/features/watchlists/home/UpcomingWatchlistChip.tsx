import { Link as ChakraLink, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { formatNextItemWithParentTitle } from "@/features/watchlists/NextItemLabel";

type UpcomingWatchlist =
  Awaited<WatchlistHomeData>["featuredSections"][number]["upcomingWatchlists"][number];

function formatIncomingWatchlistLabel(watchlist: UpcomingWatchlist) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }

  return formatNextItemWithParentTitle(nextItem);
}

type UpcomingWatchlistChipProps = {
  watchlist: UpcomingWatchlist;
};

export function UpcomingWatchlistChip({ watchlist }: UpcomingWatchlistChipProps) {
  const label = formatIncomingWatchlistLabel(watchlist);
  if (!label) {
    return null;
  }

  return (
    <ChakraLink
      asChild
      display="inline-flex"
      maxW="full"
      alignItems="center"
      rounded="full"
      borderWidth="1px"
      borderColor="border.default"
      bg="bg.surface"
      px={3}
      py={1.5}
      fontSize="sm"
      fontWeight="medium"
      color="fg.muted"
      transition="border-color 150ms, color 150ms"
      _hover={{ borderColor: "accent.solid", color: "fg.default" }}
    >
      <Link
        to="/watchlists/$watchlistId"
        params={{ watchlistId: watchlist.id.toString() }}
        preload="viewport"
      >
        <Text truncate>{label}</Text>
      </Link>
    </ChakraLink>
  );
}
