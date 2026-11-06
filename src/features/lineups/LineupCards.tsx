import { SimpleGrid } from "@chakra-ui/react";
import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";
import type { LineupData } from "./Lineups";

type Watchlist = LineupData["watchlists"][number];
export function LineupCards({ watchlists }: { watchlists: Watchlist[] }) {
  return (
    <SimpleGrid columns={{ base: 2, md: 3 }} gap={4}>
      <LineupCardItems watchlists={watchlists} />
    </SimpleGrid>
  );
}
function LineupCardItems({ watchlists }: { watchlists: Watchlist[] }) {
  return watchlists.map(LineupCardItem);
}
function LineupCardItem(watchlist: Watchlist) {
  return (
    <WatchlistCard
      key={watchlist.id}
      watchlist={watchlist}
      showUpNextBadge={false}
      infoVariant="up-next"
    />
  );
}
