import { Box, Button, Container, Heading, Link as ChakraLink, Stack, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { UpcomingWatchlistChips } from "@/features/watchlists/home/UpcomingWatchlistChips";
import type { LineupData } from "./Lineups";
import { LineupCards } from "./LineupCards";
type Lineup = LineupData["lineups"][number];
export function WatchNow({ lineups }: { lineups: Lineup[] }) {
  const visible = lineups.filter((lineup) => lineup.enabled && lineup.eligibleWatchlists.length);
  return (
    <Container maxW="7xl" py={8} pb={24}>
      <Heading as="h1" mb={4}>
        Watch Now
      </Heading>
      <Button asChild variant="outline" mb={6}>
        <Link to="/rotations">Customize</Link>
      </Button>
      {visible.length ? (
        <Stack gap={8}>
          <WatchNowLineups lineups={visible} />
        </Stack>
      ) : (
        <Box>
          <Text mb={4}>
            No lineups have eligible watchlists. Customize your lineups or add items to your lists.
          </Text>
          <Button asChild>
            <Link to="/watchlists">View My Lists</Link>
          </Button>
        </Box>
      )}
    </Container>
  );
}
function WatchNowLineups({ lineups }: { lineups: Lineup[] }) {
  return lineups.map(WatchNowLineup);
}
function WatchNowLineup(lineup: Lineup) {
  const featured = lineup.eligibleWatchlists.slice(0, 3);
  const upcoming = lineup.eligibleWatchlists.slice(3, 6);
  return (
    <Box key={`${lineup.kind}-${lineup.id}`} as="section">
      <LineupTitle lineup={lineup} />
      <LineupCards watchlists={featured} />
      <UpcomingWatchlistChips watchlists={upcoming} />
      <ViewAll lineup={lineup} />
    </Box>
  );
}
function LineupTitle({ lineup }: { lineup: Lineup }) {
  if (lineup.reference.kind === "system")
    return (
      <Heading as="h2" size="lg" mb={3}>
        {lineup.name}
      </Heading>
    );
  return (
    <Heading as="h2" size="lg" mb={3}>
      <ChakraLink asChild>
        <Link to="/rotations/custom/$lineupId" params={{ lineupId: String(lineup.reference.id) }}>
          {lineup.name}
        </Link>
      </ChakraLink>
    </Heading>
  );
}
function ViewAll({ lineup }: { lineup: Lineup }) {
  if (lineup.reference.kind !== "custom" || lineup.eligibleWatchlists.length <= 6) return null;
  return (
    <Button asChild variant="ghost">
      <Link to="/rotations/custom/$lineupId" params={{ lineupId: String(lineup.reference.id) }}>
        View all
      </Link>
    </Button>
  );
}
