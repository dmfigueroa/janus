import { getDb } from "@/db/Db.server";
import { lineupWatchlists } from "@/db/Schema";
import {
  listWatchlistSummaries,
  type WatchlistSummary,
} from "@/features/watchlists/list/Query.server";
import { listLineups } from "@/features/lineups/read/LineupConfigurationRead.server";
type Lineup = Awaited<ReturnType<typeof listLineups>>[number];
const mediaKeys: Record<string, string> = {
  movie: "movie",
  episode: "television",
  anime: "television",
  game: "game",
  book: "book",
  comic: "comic",
  manga: "comic",
};
export async function readLineups() {
  const [configuration, summaries] = await Promise.all([
    listLineups(),
    listWatchlistSummaries({ orderBy: "recency" }),
  ]);
  const memberships = getDb().select().from(lineupWatchlists).all();
  return configuration.map((lineup) =>
    buildLineup(
      lineup,
      summaries,
      memberships
        .filter((member) => member.lineupId === lineup.id)
        .map((member) => member.watchlistId),
    ),
  );
}
function buildLineup(lineup: Lineup, summaries: WatchlistSummary[], memberIds: number[]) {
  const configuredWatchlists =
    lineup.kind === "custom" ? summaries.filter((summary) => memberIds.includes(summary.id)) : null;
  const eligibleWatchlists = summaries.filter(
    (summary) => isEligible(summary) && belongs(lineup, summary, memberIds),
  );
  return {
    ...lineup,
    configuredWatchlists,
    eligibleWatchlists,
    configuredCount: configuredCount(configuredWatchlists),
    eligibleCount: eligibleWatchlists.length,
  };
}
function configuredCount(watchlists: WatchlistSummary[] | null) {
  return watchlists?.length ?? null;
}
function isEligible(summary: WatchlistSummary) {
  return summary.pausedAt === null && summary.stats.nextUnwatched !== null;
}
function belongs(lineup: Lineup, summary: WatchlistSummary, memberIds: number[]) {
  if (lineup.kind === "custom") return memberIds.includes(summary.id);
  return mediaKeys[summary.stats.nextUnwatched!.mediaType] === lineup.systemKey;
}
