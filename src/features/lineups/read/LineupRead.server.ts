import { readWatchlistLifecycle } from "@/features/watchlists/lifecycle/WatchlistLifecycle";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { lineupWatchlists, type WatchlistItem } from "@/db/Schema";
import {
  listWatchlistSummaries,
  type WatchlistSummary,
} from "@/features/watchlists/list/Query.server";
import {
  findLineup,
  listLineups,
  type CustomLineupRecord,
  type LineupWithReference,
  type SystemLineupRecord,
} from "@/features/lineups/manage/LineupConfiguration.server";
import type { LineupReference, SystemLineupKey } from "@/features/lineups/LineupReference";

export type SystemLineup = SystemLineupRecord & {
  eligibleWatchlists: WatchlistSummary[];
  eligibleCount: number;
};

export type CustomLineup = CustomLineupRecord & {
  configuredWatchlists: WatchlistSummary[];
  configuredCount: number;
  eligibleWatchlists: WatchlistSummary[];
  eligibleCount: number;
};

export type Lineup = SystemLineup | CustomLineup;

const mediaKeys: Record<WatchlistItem["mediaType"], SystemLineupKey> = {
  movie: "movie",
  episode: "television",
  anime: "television",
  game: "game",
  book: "book",
  comic: "comic",
  manga: "comic",
};

export async function readLineups(): Promise<Lineup[]> {
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

export async function readLineup(reference: LineupReference): Promise<Lineup | undefined> {
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
): Lineup {
  switch (lineup.kind) {
    case "system":
      return buildSystemLineup(lineup, summaries);
    case "custom":
      return buildCustomLineup(lineup, summaries, memberIds);
  }
}

function buildSystemLineup(
  lineup: SystemLineupRecord,
  summaries: WatchlistSummary[],
): SystemLineup {
  const eligibleWatchlists = summaries.filter((summary) =>
    isEligibleSystemWatchlist(summary, lineup.systemKey),
  );
  return {
    ...lineup,
    eligibleWatchlists,
    eligibleCount: eligibleWatchlists.length,
  };
}

function buildCustomLineup(
  lineup: CustomLineupRecord,
  summaries: WatchlistSummary[],
  memberIds: number[],
): CustomLineup {
  const configuredWatchlists = summaries.filter((summary) => memberIds.includes(summary.id));
  const eligibleWatchlists = configuredWatchlists.filter(isEligibleWatchlist);
  return {
    ...lineup,
    configuredWatchlists,
    configuredCount: configuredWatchlists.length,
    eligibleWatchlists,
    eligibleCount: eligibleWatchlists.length,
  };
}

function isEligibleWatchlist(summary: WatchlistSummary) {
  return readWatchlistLifecycle(summary).eligible && summary.stats.nextUnwatched !== null;
}

function isEligibleSystemWatchlist(summary: WatchlistSummary, systemKey: SystemLineupKey) {
  const nextUnwatched = summary.stats.nextUnwatched;
  return (
    readWatchlistLifecycle(summary).eligible &&
    nextUnwatched !== null &&
    mediaKeys[nextUnwatched.mediaType] === systemKey
  );
}
