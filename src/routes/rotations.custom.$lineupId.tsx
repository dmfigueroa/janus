import { Container, Heading, Text, Button } from "@chakra-ui/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { NotFound } from "@/components/NotFound";
import type { LineupData } from "@/features/lineups/manage/Lineups";
import { lineupsQueryOptions, useLineupData } from "@/features/lineups/read/useLineupData";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { LineupCards } from "@/features/lineups/components/LineupCards";

export const Route = createFileRoute("/rotations/custom/$lineupId")({
  headers: () => ({ "Cache-Control": "private, no-cache" }),
  loader: async ({ context, params }) => {
    const id = Number(params.lineupId);
    if (!validLineupId(id)) throw notFound();
    const data = await context.queryClient.ensureQueryData({
      ...lineupsQueryOptions(),
      revalidateIfStale: true,
    });
    if (!findCustomLineup(data.lineups, id)) throw notFound();
  },
  component: Detail,
});

function Detail() {
  const { lineupId } = Route.useParams();
  const { data } = useLineupData();
  const lineup = findCustomLineup(data.lineups, Number(lineupId));
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

function findCustomLineup(lineups: LineupData["lineups"], id: number) {
  return lineups
    .filter((entry) => entry.kind === "custom")
    .find((entry) => entry.reference.id === id);
}

function validLineupId(id: number) {
  return Number.isInteger(id) && id > 0;
}
