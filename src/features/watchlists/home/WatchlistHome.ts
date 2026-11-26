import { readWatchlistLifecycle } from "../lifecycle/WatchlistLifecycle";
import { createServerFn } from "@tanstack/react-start";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";

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

function partitionWatchlistHomeSections(allWatchlists: WatchlistSummary[]) {
  return {
    rotation: allWatchlists.filter(
      (watchlist) => readWatchlistLifecycle(watchlist).section === "rotation",
    ),
    completed: allWatchlists.filter(
      (watchlist) => readWatchlistLifecycle(watchlist).section === "completed",
    ),
    paused: allWatchlists.filter(
      (watchlist) => readWatchlistLifecycle(watchlist).section === "paused",
    ),
    empty: allWatchlists.filter(
      (watchlist) => readWatchlistLifecycle(watchlist).section === "empty",
    ),
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

export function buildWatchlistHome(allWatchlists: WatchlistSummary[]) {
  const sections = partitionWatchlistHomeSections(allWatchlists);
  const buckets = sections.rotation.reduce(addWatchlistToHomeBucket, new Map());
  const totals = buildWatchlistHomeTotals(allWatchlists);
  const featuredSections = buildFeaturedHomeSections(buckets);

  return { totals, featuredSections, allWatchlists, ...sections };
}

export type WatchlistHomeData = ReturnType<typeof buildWatchlistHome>;

export const getWatchlistHomeData = createServerFn().handler(async () => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { listWatchlistSummaries } = await import("@/features/watchlists/list/Query.server");
  setResponseHeader("cache-control", "private, no-cache");
  const allWatchlists = await listWatchlistSummaries({ orderBy: "recency" });
  return buildWatchlistHome(allWatchlists);
});
