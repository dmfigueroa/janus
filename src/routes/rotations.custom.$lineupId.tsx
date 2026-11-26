import { Container, Heading, Text, Button } from "@chakra-ui/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { getLineupData } from "@/features/lineups/manage/Lineups";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { LineupCards } from "@/features/lineups/components/LineupCards";
export const Route = createFileRoute("/rotations/custom/$lineupId")({
  loader: async ({ params }) => {
    const id = Number(params.lineupId);
    if (!validLineupId(id)) throw notFound();
    const data = await getLineupData();
    const lineup = data.lineups
      .filter((entry) => entry.kind === "custom")
      .find((entry) => entry.reference.id === id);
    if (!lineup) throw notFound();
    return { lineup, watchlists: data.watchlists };
  },
  component: Detail,
});
function Detail() {
  const { lineup, watchlists } = Route.useLoaderData();
  return (
    <Container maxW="7xl" py={8} pb={24}>
      <Heading as="h1" mb={4}>
        {lineup.name}
      </Heading>
      <LineupEditor
        lineup={lineup}
        watchlists={watchlists}
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

function validLineupId(id: number) {
  return Number.isInteger(id) && id > 0;
}
