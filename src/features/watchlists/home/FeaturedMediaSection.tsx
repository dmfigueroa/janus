import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";
import type { WatchlistHomeData } from "@/features/watchlists/home/WatchlistHome";
import { UpcomingWatchlistChips } from "@/features/watchlists/home/UpcomingWatchlistChips";

type FeaturedMediaSectionProps = {
  section: WatchlistHomeData["featuredSections"][number];
};

export function FeaturedMediaSection({ section }: FeaturedMediaSectionProps) {
  return (
    <Box>
      <Heading as="h3" size="lg" fontWeight="semibold" mb={3}>
        {section.title}
      </Heading>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={{ base: 4, md: 6 }}>
        <FeaturedWatchlistGridItems watchlists={section.watchlists} />
      </SimpleGrid>
      <UpcomingWatchlistChips watchlists={section.upcomingWatchlists} />
    </Box>
  );
}

function FeaturedWatchlistGridItems({
  watchlists,
}: {
  watchlists: FeaturedMediaSectionProps["section"]["watchlists"];
}) {
  return watchlists.map(FeaturedWatchlistGridItem);
}

function FeaturedWatchlistGridItem(
  watchlist: FeaturedMediaSectionProps["section"]["watchlists"][number],
) {
  return (
    <Box key={watchlist.id} w="full" maxW={{ md: "220px" }}>
      <WatchlistCard watchlist={watchlist} showUpNextBadge={false} infoVariant="up-next" />
    </Box>
  );
}
import { Box, Heading, SimpleGrid } from "@chakra-ui/react";
