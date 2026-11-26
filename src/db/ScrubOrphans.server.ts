import type Database from "better-sqlite3";
import {
  checkForeignKeys,
  formatForeignKeyViolations,
  openSqliteConnection,
  type ForeignKeyViolation,
} from "./SqliteConnection.server.ts";

export interface OrphanCounts {
  watchlistItems: number;
  lineupWatchlists: number;
}

export interface OrphanScrubReport {
  databasePath: string;
  mode: "dry-run" | "apply";
  foreignKeyViolationsBefore: ForeignKeyViolation[];
  orphansFound: OrphanCounts;
  deleted: OrphanCounts;
  foreignKeyViolationsAfter: ForeignKeyViolation[];
}

export interface ScrubOrphansOptions {
  apply?: boolean;
}

function countOrphans(sqlite: Database.Database): OrphanCounts {
  const watchlistItems = (
    sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM watchlist_items WHERE watchlist_id NOT IN (SELECT id FROM watchlists)",
      )
      .get() as { count: number }
  ).count;
  const lineupWatchlists = (
    sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM lineup_watchlists WHERE lineup_id NOT IN (SELECT id FROM lineups) OR watchlist_id NOT IN (SELECT id FROM watchlists)",
      )
      .get() as { count: number }
  ).count;
  return { watchlistItems, lineupWatchlists };
}

function deleteOrphans(sqlite: Database.Database): OrphanCounts {
  const remove = sqlite.transaction(() => {
    const watchlistItems = sqlite
      .prepare("DELETE FROM watchlist_items WHERE watchlist_id NOT IN (SELECT id FROM watchlists)")
      .run().changes;
    const lineupWatchlists = sqlite
      .prepare(
        "DELETE FROM lineup_watchlists WHERE lineup_id NOT IN (SELECT id FROM lineups) OR watchlist_id NOT IN (SELECT id FROM watchlists)",
      )
      .run().changes;
    return { watchlistItems, lineupWatchlists };
  });
  return remove.immediate();
}

function dryRunOrphanScrub(sqlite: Database.Database, databasePath: string): OrphanScrubReport {
  const foreignKeyViolationsBefore = checkForeignKeys(sqlite);
  const orphansFound = countOrphans(sqlite);
  return {
    databasePath,
    mode: "dry-run",
    foreignKeyViolationsBefore,
    orphansFound,
    deleted: { watchlistItems: 0, lineupWatchlists: 0 },
    foreignKeyViolationsAfter: foreignKeyViolationsBefore,
  };
}

function applyOrphanScrub(sqlite: Database.Database, databasePath: string): OrphanScrubReport {
  const foreignKeyViolationsBefore = checkForeignKeys(sqlite);
  const orphansFound = countOrphans(sqlite);
  const deleted = deleteOrphans(sqlite);
  const foreignKeyViolationsAfter = checkForeignKeys(sqlite);
  if (foreignKeyViolationsAfter.length > 0) {
    throw new Error(formatForeignKeyViolations(foreignKeyViolationsAfter));
  }
  return {
    databasePath,
    mode: "apply",
    foreignKeyViolationsBefore,
    orphansFound,
    deleted,
    foreignKeyViolationsAfter,
  };
}

export function scrubSqliteOrphans(
  databasePath: string,
  options: ScrubOrphansOptions = {},
): OrphanScrubReport {
  const apply = Boolean(options.apply);
  const sqlite = openSqliteConnection(databasePath, {
    readonly: !apply,
    fileMustExist: true,
  });

  try {
    return apply ? applyOrphanScrub(sqlite, databasePath) : dryRunOrphanScrub(sqlite, databasePath);
  } finally {
    sqlite.close();
  }
}
