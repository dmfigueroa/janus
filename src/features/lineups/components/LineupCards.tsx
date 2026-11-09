import { Grid } from "@chakra-ui/react";
import { WatchlistCard } from "@/features/watchlists/components/WatchlistCard";
import type { LineupData } from "@/features/lineups/manage/Lineups";

type Watchlist = LineupData["watchlists"][number];
export function LineupCards({ watchlists }: { watchlists: Watchlist[] }) {
  return (
    <Grid
      templateColumns={{
        base: "repeat(2, minmax(0, 1fr))",
        md: "repeat(auto-fill, minmax(200px, 240px))",
      }}
      gap={4}
    >
      <LineupCardItems watchlists={watchlists} />
    </Grid>
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
