import { createServerFn } from "@tanstack/react-start";
import {
  listWatchlistSummaries,
  type WatchlistSummary,
} from "@/features/watchlists/list/Query.server";

const HOME_SECTION_ORDER = [
  { key: "movie", title: "Movies" },
  { key: "tv", title: "TV" },
  { key: "game", title: "Games" },
  { key: "book", title: "Books" },
  { key: "comic", title: "Comics" },
] as const;

type WatchlistHomeSectionKey = (typeof HOME_SECTION_ORDER)[number]["key"];
const MAX_FEATURED_WATCHLISTS_PER_SECTION = 3;
const HOME_SECTION_BY_MEDIA_TYPE: Partial<
  Record<NonNullable<WatchlistSummary["stats"]["coverMediaType"]>, WatchlistHomeSectionKey>
> = {
  movie: "movie",
  episode: "tv",
  anime: "tv",
  game: "game",
  book: "book",
  comic: "comic",
  manga: "comic",
};

function normalizeHomeSectionKey(mediaType: WatchlistSummary["stats"]["coverMediaType"]) {
  if (mediaType === null) {
    return null;
  }
  return HOME_SECTION_BY_MEDIA_TYPE[mediaType] ?? null;
}

function getWatchlistHomeSectionKey(watchlist: WatchlistSummary) {
  const nextItem = watchlist.stats.nextUnwatched;
  if (!nextItem) {
    return null;
  }
  return normalizeHomeSectionKey(nextItem.mediaType);
}

function addWatchlistToHomeBucket(
  buckets: Map<WatchlistHomeSectionKey, WatchlistSummary[]>,
  watchlist: WatchlistSummary,
) {
  const sectionKey = getWatchlistHomeSectionKey(watchlist);
  if (!sectionKey) {
    return buckets;
  }

  let watchlists = buckets.get(sectionKey);
  if (!watchlists) {
    watchlists = [];
  }
  watchlists.push(watchlist);
  buckets.set(sectionKey, watchlists);
  return buckets;
}

function buildWatchlistHomeTotals(watchlists: WatchlistSummary[]) {
  return {
    watchlists: watchlists.length,
    items: watchlists.reduce((total, watchlist) => total + watchlist.stats.totalItems, 0),
  };
}

function buildFeaturedHomeSection(
  section: (typeof HOME_SECTION_ORDER)[number],
  buckets: Map<WatchlistHomeSectionKey, WatchlistSummary[]>,
) {
  const watchlists = buckets.get(section.key);
  if (!watchlists || watchlists.length === 0) {
    return [];
  }

  return [
    {
      key: section.key,
      title: section.title,
      watchlists: watchlists.slice(0, MAX_FEATURED_WATCHLISTS_PER_SECTION),
      upcomingWatchlists: watchlists.slice(
        MAX_FEATURED_WATCHLISTS_PER_SECTION,
        MAX_FEATURED_WATCHLISTS_PER_SECTION * 2,
      ),
    },
  ];
}

function buildFeaturedHomeSections(buckets: Map<WatchlistHomeSectionKey, WatchlistSummary[]>) {
  return HOME_SECTION_ORDER.flatMap((section) => buildFeaturedHomeSection(section, buckets));
}

export async function getWatchlistHome() {
  const allWatchlists = await listWatchlistSummaries({ orderBy: "recency" });
  const buckets = allWatchlists.reduce(addWatchlistToHomeBucket, new Map());
  const totals = buildWatchlistHomeTotals(allWatchlists);
  const featuredSections = buildFeaturedHomeSections(buckets);

  return { totals, featuredSections, allWatchlists };
}

export const getWatchlistHomeData = createServerFn().handler(getWatchlistHome);
