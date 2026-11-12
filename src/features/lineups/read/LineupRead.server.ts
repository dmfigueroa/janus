import { readWatchlistLifecycle } from "@/features/watchlists/lifecycle/WatchlistLifecycle";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { lineupWatchlists } from "@/db/Schema";
import {
  listWatchlistSummaries,
  type WatchlistSummary,
} from "@/features/watchlists/list/Query.server";
import {
  findLineup,
  listLineups,
  type LineupWithReference,
} from "@/features/lineups/manage/LineupConfiguration.server";
import type { LineupReference } from "@/features/lineups/LineupReference";

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

export async function readLineup(reference: LineupReference) {
  const [lineup, summaries] = await Promise.all([
    findLineup(reference),
    listWatchlistSummaries({ orderBy: "recency" }),
  ]);
  if (!lineup) return undefined;
  const memberIds = getDb()
    .select()
    .from(lineupWatchlists)
    .where(eq(lineupWatchlists.lineupId, lineup.id))
    .all()
    .map((member) => member.watchlistId);
  return buildLineup(lineup, summaries, memberIds);
}

function buildLineup(
  lineup: LineupWithReference,
  summaries: WatchlistSummary[],
  memberIds: number[],
) {
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
  return readWatchlistLifecycle(summary).eligible && summary.stats.nextUnwatched !== null;
}

function belongs(lineup: LineupWithReference, summary: WatchlistSummary, memberIds: number[]) {
  if (lineup.kind === "custom") return memberIds.includes(summary.id);
  return mediaKeys[summary.stats.nextUnwatched!.mediaType] === lineup.systemKey;
}
