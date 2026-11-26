import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const SQLITE_BUSY_TIMEOUT_MS = 5000;

export interface OpenSqliteOptions {
  foreignKeys?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export interface ForeignKeyViolation {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
}

function isFileBackedDatabasePath(databasePath: string): boolean {
  return databasePath !== ":memory:" && databasePath !== "";
}

function applyJournalMode(
  sqlite: Database.Database,
  databasePath: string,
  readonly: boolean,
): void {
  if (!readonly && isFileBackedDatabasePath(databasePath)) {
    sqlite.pragma("journal_mode = WAL");
  }
}

function resolveForeignKeysPragma(foreignKeys: boolean | undefined): "ON" | "OFF" {
  return foreignKeys === false ? "OFF" : "ON";
}

export function openSqliteConnection(
  databasePath: string,
  options: OpenSqliteOptions = {},
): Database.Database {
  const readonly = Boolean(options.readonly);
  const fileMustExist = Boolean(options.fileMustExist);
  const sqlite = new Database(databasePath, {
    timeout: SQLITE_BUSY_TIMEOUT_MS,
    readonly,
    fileMustExist,
  });

  sqlite.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  applyJournalMode(sqlite, databasePath, readonly);
  sqlite.pragma(`foreign_keys = ${resolveForeignKeysPragma(options.foreignKeys)}`);
  return sqlite;
}

export function checkForeignKeys(sqlite: Database.Database): ForeignKeyViolation[] {
  return sqlite.pragma("foreign_key_check") as ForeignKeyViolation[];
}

export function formatForeignKeyViolations(violations: ForeignKeyViolation[]): string {
  const summary = violations
    .slice(0, 10)
    .map((violation) => `${violation.table}(rowid=${violation.rowid}) -> ${violation.parent}`)
    .join(", ");
  return `SQLite foreign_key_check found ${violations.length} violation(s): ${summary}`;
}

function backfillNullIsWatched(sqlite: Database.Database): void {
  const columns = sqlite.pragma("table_info('watchlist_items')") as Array<{
    name: string;
    notnull: number;
  }>;
  if (columns.some((column) => column.name === "is_watched" && column.notnull === 0)) {
    sqlite.prepare("UPDATE watchlist_items SET is_watched = 0 WHERE is_watched IS NULL").run();
  }
}

export function runSqliteMigrations(sqlite: Database.Database, migrationsFolder: string): void {
  sqlite.pragma("foreign_keys = OFF");
  try {
    backfillNullIsWatched(sqlite);
    migrate(drizzle(sqlite), { migrationsFolder });
    const violations = checkForeignKeys(sqlite);
    if (violations.length > 0) {
      throw new Error(formatForeignKeyViolations(violations));
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
