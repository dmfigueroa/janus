import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { checkForeignKeys } from "@/db/SqliteConnection.server";

const MEDIA_TYPES = new Set(["movie", "episode", "game", "book", "comic", "anime", "manga"]);
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}(?:\.\d{3})?|T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;
const RELEASE_DATE_PATTERN = /^(\d{4}|\d{4}-\d{2}-\d{2})$/;
const POSTER_PATH_PATTERN = /^(\/[^\s]+|https:\/\/[^\s]+)$/;

interface WatchlistRow {
  id: number;
  name: string;
  description: string | null;
  item_order_mode: string;
  created_at: string;
  updated_at: string | null;
  last_watched_at: string | null;
  last_item_added_at: string | null;
  paused_at: string | null;
}

interface WatchlistItemRow {
  id: number;
  watchlist_id: number;
  tmdb_id: string;
  source: string;
  media_type: string;
  title: string;
  parent_id: string | null;
  parent_title: string | null;
  season: number | null;
  episode: string | null;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  runtime: number | null;
  custom_rank: number | null;
  is_watched: number;
  authors: string | null;
  added_at: string;
}

export interface SqliteStateSnapshot {
  watchlists: WatchlistRow[];
  watchlistItems: WatchlistItemRow[];
  lineups: unknown[];
  lineupWatchlists: unknown[];
}

export function assertSqliteCheckRep(
  sqlite: Database.Database,
  fullyRankedWatchlists: readonly number[] = [],
): void {
  const foreignKeyViolations = checkForeignKeys(sqlite);
  assert.deepEqual(foreignKeyViolations, [], "SQLite foreign_key_check must pass");

  const watchlists = sqlite
    .prepare("SELECT * FROM watchlists ORDER BY id ASC")
    .all() as WatchlistRow[];
  const items = sqlite
    .prepare("SELECT * FROM watchlist_items ORDER BY watchlist_id ASC, id ASC")
    .all() as WatchlistItemRow[];

  watchlists.forEach(assertWatchlistRowInvariants);
  items.forEach(assertWatchlistItemRowInvariants);
  assertCustomRankInvariants(watchlists, items, new Set(fullyRankedWatchlists));
}

function assertWatchlistRowInvariants(row: WatchlistRow): void {
  assert.ok(row.name.trim().length > 0, `watchlist ${row.id} name must be non-empty`);
  assert.ok(
    row.item_order_mode === "release" || row.item_order_mode === "custom",
    `watchlist ${row.id} invalid item_order_mode: ${row.item_order_mode}`,
  );
  assertTimestamp(row.created_at, `watchlist ${row.id}.created_at`);
  assertNullableTimestamp(row.updated_at, `watchlist ${row.id}.updated_at`);
  assertNullableTimestamp(row.last_watched_at, `watchlist ${row.id}.last_watched_at`);
  assertNullableTimestamp(row.last_item_added_at, `watchlist ${row.id}.last_item_added_at`);
  assertNullableTimestamp(row.paused_at, `watchlist ${row.id}.paused_at`);
}

function assertTimestamp(value: string, label: string): void {
  assert.match(value, TIMESTAMP_PATTERN, `invalid ${label}: ${value}`);
}

function assertNullableTimestamp(value: string | null, label: string): void {
  if (value === null) return;
  assertTimestamp(value, label);
}

function assertWatchlistItemRowInvariants(item: WatchlistItemRow): void {
  assert.ok(
    MEDIA_TYPES.has(item.media_type),
    `item ${item.id} invalid media_type: ${item.media_type}`,
  );
  assert.ok(item.title.trim().length > 0, `item ${item.id} title must be non-empty`);
  assert.ok(
    item.is_watched === 0 || item.is_watched === 1,
    `item ${item.id} invalid is_watched: ${String(item.is_watched)}`,
  );
  assertOptionalReleaseDate(item.release_date, item.id);
  assertOptionalPosterPath(item.poster_path, item.id);
  assertOptionalAuthors(item.authors, item.id);
}

function assertOptionalReleaseDate(value: string | null, itemId: number): void {
  if (value === null || value === "") return;
  assert.match(value, RELEASE_DATE_PATTERN, `item ${itemId} invalid release_date: ${value}`);
}

function assertOptionalPosterPath(value: string | null, itemId: number): void {
  if (value === null) return;
  assert.match(value, POSTER_PATH_PATTERN, `item ${itemId} invalid poster_path: ${value}`);
}

function assertOptionalAuthors(value: string | null, itemId: number): void {
  if (value === null) return;
  const parsed: unknown = JSON.parse(value);
  assert.ok(
    Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string"),
    `item ${itemId} invalid authors JSON: ${value}`,
  );
}

function assertCustomRankInvariants(
  watchlists: readonly WatchlistRow[],
  items: readonly WatchlistItemRow[],
  fullyRankedIds: ReadonlySet<number>,
): void {
  const customWatchlists = watchlists.filter((watchlist) => watchlist.item_order_mode === "custom");
  customWatchlists.forEach((watchlist) => {
    const listItems = items.filter((item) => item.watchlist_id === watchlist.id);
    if (listItems.length > 0) {
      assertSingleCustomWatchlistRanks(watchlist.id, listItems, fullyRankedIds.has(watchlist.id));
    }
  });
}

function assertSingleCustomWatchlistRanks(
  watchlistId: number,
  listItems: readonly WatchlistItemRow[],
  requireAllRanked: boolean,
): void {
  const ranks = listItems
    .map((item) => item.custom_rank)
    .filter((rank): rank is number => rank !== null)
    .sort((left, right) => left - right);

  assert.ok(
    ranks.length > 0,
    `custom watchlist ${watchlistId} has ${listItems.length} items but zero custom_rank values`,
  );
  if (requireAllRanked) {
    assert.equal(
      ranks.length,
      listItems.length,
      `custom watchlist ${watchlistId} expected all ${listItems.length} items ranked`,
    );
  }
  const expectedContiguous = ranks.map((_, index) => index + 1);
  assert.deepEqual(
    ranks,
    expectedContiguous,
    `custom watchlist ${watchlistId} ranks must be contiguous 1..K without gaps or duplicates`,
  );
}

export function snapshotSqliteState(sqlite: Database.Database): SqliteStateSnapshot {
  return {
    watchlists: sqlite.prepare("SELECT * FROM watchlists ORDER BY id ASC").all() as WatchlistRow[],
    watchlistItems: sqlite
      .prepare("SELECT * FROM watchlist_items ORDER BY watchlist_id ASC, id ASC")
      .all() as WatchlistItemRow[],
    lineups: sqlite.prepare("SELECT * FROM lineups ORDER BY id ASC").all(),
    lineupWatchlists: sqlite
      .prepare("SELECT * FROM lineup_watchlists ORDER BY lineup_id ASC, watchlist_id ASC")
      .all(),
  };
}
