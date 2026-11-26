import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

export interface PortedToolDeclaration {
  name: string;
  title: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint?: boolean;
  };
}

export interface FixtureWatchlist {
  id: number;
  name: string;
  description: string | null;
  item_order_mode: "release" | "custom";
  created_at: string;
  updated_at: string | null;
  last_watched_at: string | null;
  last_item_added_at: string | null;
  paused_at: string | null;
}

export interface FixtureWatchlistItem {
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
  is_watched: number | null;
  authors: string[] | null;
  added_at: string;
}

export interface StepExpectation {
  kind: "ok" | "toolError" | "rpcInvalidParams";
  errorContains?: string;
  hasCursor?: boolean;
  hasOrderToken?: boolean;
}

export interface ComplianceStep {
  tool: string;
  arguments: Record<string, unknown>;
  expect: StepExpectation;
}

export interface ComplianceCase {
  id: string;
  description: string;
  mutating: boolean;
  setupSql?: string[];
  expectFullyRankedWatchlists?: number[];
  steps: ComplianceStep[];
}

export interface StatefulStep {
  actor: "v1" | "v2" | "both";
  tool: string;
  arguments: Record<string, unknown>;
  mutating: boolean;
  expectFullyRankedWatchlists?: number[];
}

export interface StatefulSequence {
  id: string;
  description: string;
  steps: StatefulStep[];
}

export interface McpWatchlistsContract {
  version: number;
  tools: {
    ported: PortedToolDeclaration[];
    pending: string[];
  };
  fixture: {
    watchlists: FixtureWatchlist[];
    watchlistItems: FixtureWatchlistItem[];
  };
  cases: ComplianceCase[];
  statefulSequences: StatefulSequence[];
}

export function loadMcpContract(): McpWatchlistsContract {
  const contractPath = path.resolve(process.cwd(), "contracts/mcp-watchlists.json");
  return JSON.parse(readFileSync(contractPath, "utf8")) as McpWatchlistsContract;
}

export function collectFixtureTimestamps(contract: McpWatchlistsContract): Set<string> {
  const timestamps = new Set<string>();
  const record = (value: string | null) => {
    if (value) timestamps.add(value);
  };
  for (const watchlist of contract.fixture.watchlists) {
    record(watchlist.created_at);
    record(watchlist.updated_at);
    record(watchlist.last_watched_at);
    record(watchlist.last_item_added_at);
    record(watchlist.paused_at);
  }
  for (const item of contract.fixture.watchlistItems) {
    record(item.added_at);
  }
  return timestamps;
}

export function resetAndSeedFixture(
  sqlite: Database.Database,
  contract: McpWatchlistsContract,
  setupSql: readonly string[] = [],
): void {
  sqlite.transaction(() => {
    clearTables(sqlite);
    insertWatchlists(sqlite, contract.fixture.watchlists);
    insertWatchlistItems(sqlite, contract.fixture.watchlistItems);
    for (const statement of setupSql) {
      sqlite.exec(statement);
    }
  })();
}

function clearTables(sqlite: Database.Database): void {
  sqlite.exec("DELETE FROM lineup_watchlists");
  sqlite.exec("DELETE FROM lineups");
  sqlite.exec("DELETE FROM watchlist_items");
  sqlite.exec("DELETE FROM watchlists");
  const hasSequence = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (hasSequence) {
    sqlite.exec("DELETE FROM sqlite_sequence");
  }
}

function insertWatchlists(sqlite: Database.Database, rows: readonly FixtureWatchlist[]): void {
  const statement = sqlite.prepare(
    "INSERT INTO watchlists(id, name, description, item_order_mode, created_at, updated_at, last_watched_at, last_item_added_at, paused_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const row of rows) {
    statement.run(
      row.id,
      row.name,
      row.description,
      row.item_order_mode,
      row.created_at,
      row.updated_at,
      row.last_watched_at,
      row.last_item_added_at,
      row.paused_at,
    );
  }
}

function insertWatchlistItems(
  sqlite: Database.Database,
  rows: readonly FixtureWatchlistItem[],
): void {
  const statement = sqlite.prepare(
    "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title, season, episode, poster_path, release_date, vote_average, runtime, custom_rank, is_watched, authors, added_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const row of rows) {
    statement.run(
      row.id,
      row.watchlist_id,
      row.tmdb_id,
      row.source,
      row.media_type,
      row.title,
      row.parent_id,
      row.parent_title,
      row.season,
      row.episode,
      row.poster_path,
      row.release_date,
      row.vote_average,
      row.runtime,
      row.custom_rank,
      row.is_watched,
      row.authors === null ? null : JSON.stringify(row.authors),
      row.added_at,
    );
  }
}

export function resolveStepArguments(
  rawArguments: Record<string, unknown>,
  previousCursor: string | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rawArguments).map(([key, value]) => [
      key,
      value === "$prev.nextCursor" ? previousCursor : value,
    ]),
  );
}
