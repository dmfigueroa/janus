import { Container, Heading, Text, Button } from "@chakra-ui/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { NotFound } from "@/components/NotFound";
import {
  ensureCustomLineup,
  findCustomLineup,
  useLineupData,
} from "@/features/lineups/read/useLineupData";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { LineupCards } from "@/features/lineups/components/LineupCards";
import { parsePositiveIntegerParam } from "@/shared/RouteParams";

export const Route = createFileRoute("/rotations/custom/$lineupId")({
  headers: () => ({ "Cache-Control": "private, no-cache" }),
  beforeLoad: ({ params: { lineupId } }) => {
    const parsedLineupId = parsePositiveIntegerParam(lineupId);
    if (parsedLineupId === null) {
      throw notFound();
    }

    return { lineupId: parsedLineupId };
  },
  loader: async ({ context }) => {
    await ensureCustomLineup(context.queryClient, context.lineupId);
  },
  component: Detail,
});

function Detail() {
  const { lineupId } = Route.useRouteContext();
  const { data } = useLineupData();
  const lineup = findCustomLineup(data.lineups, lineupId);
  if (!lineup) return <NotFound />;
  return (
    <Container maxW="7xl" py={8} pb={24}>
      <Heading as="h1" mb={4}>
        {lineup.name}
      </Heading>
      <LineupEditor
        lineup={lineup}
        watchlists={data.watchlists}
        trigger={<Button mb={6}>Edit lineup</Button>}
      />
      {lineup.eligibleWatchlists.length ? (
        <LineupCards watchlists={lineup.eligibleWatchlists} />
      ) : (
        <Text>No eligible watchlists in this lineup.</Text>
      )}
    </Container>
  );
}
