import {
  listWatchlistSummaries,
  type WatchlistSummary,
} from "@/features/watchlists/list/query.server";

export type WatchlistHomeSectionKey = "movie" | "tv" | "game" | "book" | "comic";

export type WatchlistHomeSection = {
  key: WatchlistHomeSectionKey;
  title: string;
  watchlists: WatchlistSummary[];
  incomingWatchlists: WatchlistSummary[];
};

export type WatchlistHomeTotals = {
  watchlists: number;
  items: number;
};

export type WatchlistHomeScreen = {
  totals: WatchlistHomeTotals;
  featuredSections: WatchlistHomeSection[];
  allWatchlists: WatchlistSummary[];
};

const HOME_SECTION_ORDER: Array<{ key: WatchlistHomeSectionKey; title: string }> = [
  { key: "movie", title: "Movies" },
  { key: "tv", title: "TV" },
  { key: "game", title: "Games" },
  { key: "book", title: "Books" },
  { key: "comic", title: "Comics" },
];
const MAX_FEATURED_WATCHLISTS_PER_SECTION = 3;

function compareOptionalTimestampsAsc(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function compareWatchlistHomeRank(left: WatchlistSummary, right: WatchlistSummary) {
  const lastWatchedComparison = compareOptionalTimestampsAsc(
    left.lastWatchedAt,
    right.lastWatchedAt,
  );
  if (lastWatchedComparison !== 0) {
    return lastWatchedComparison;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.id - right.id;
}

function normalizeHomeSectionKey(mediaType: WatchlistSummary["stats"]["coverMediaType"]) {
  switch (mediaType) {
    case "movie":
      return "movie";
    case "episode":
    case "anime":
      return "tv";
    case "game":
      return "game";
    case "book":
      return "book";
    case "comic":
    case "manga":
      return "comic";
    default:
      return null;
  }
}

export async function getWatchlistHome(): Promise<WatchlistHomeScreen> {
  const allWatchlists = (
    await listWatchlistSummaries({
      orderBy: "lastWatched",
      order: "asc",
    })
  ).toSorted(compareWatchlistHomeRank);

  const buckets = new Map<WatchlistHomeSectionKey, WatchlistSummary[]>();

  for (const watchlist of allWatchlists) {
    const nextItem = watchlist.stats.nextUnwatched;
    if (!nextItem) {
      continue;
    }

    const sectionKey = normalizeHomeSectionKey(nextItem.mediaType);
    if (!sectionKey) {
      continue;
    }

    const existing = buckets.get(sectionKey) ?? [];
    existing.push(watchlist);
    buckets.set(sectionKey, existing);
  }

  return {
    totals: {
      watchlists: allWatchlists.length,
      items: allWatchlists.reduce((total, watchlist) => total + watchlist.stats.totalItems, 0),
    },
    featuredSections: HOME_SECTION_ORDER.flatMap(({ key, title }) => {
      const watchlists = buckets.get(key);
      if (!watchlists || watchlists.length === 0) {
        return [];
      }

      return [
        {
          key,
          title,
          watchlists: watchlists.slice(0, MAX_FEATURED_WATCHLISTS_PER_SECTION),
          incomingWatchlists: watchlists.slice(
            MAX_FEATURED_WATCHLISTS_PER_SECTION,
            MAX_FEATURED_WATCHLISTS_PER_SECTION * 2,
          ),
        },
      ];
    }),
    allWatchlists,
  };
}
