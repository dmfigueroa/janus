import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "@/db/Schema";
import { openSqliteConnection, runSqliteMigrations } from "@/db/SqliteConnection.server";
import { registerUnicodeCaseFold } from "@/db/UnicodeCaseFold.server";

export type IsolatedTestDb = BetterSQLite3Database<typeof schema>;

interface DrizzleJournal {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
}

function buildPartialMigrationsFolder(maxMigrationIndex: number): string {
  const sourceDirectory = path.resolve(process.cwd(), "drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(sourceDirectory, "meta", "_journal.json"), "utf8"),
  ) as DrizzleJournal;
  const entries = journal.entries.filter((entry) => entry.idx <= maxMigrationIndex);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "janus-migrations-slice-"));
  fs.mkdirSync(path.join(temporaryDirectory, "meta"));
  fs.writeFileSync(
    path.join(temporaryDirectory, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(sourceDirectory, `${entry.tag}.sql`),
      path.join(temporaryDirectory, `${entry.tag}.sql`),
    );
  }
  return temporaryDirectory;
}

function migrateIsolatedDatabase(
  sqlite: ReturnType<typeof openSqliteConnection>,
  maxMigrationIndex: number | undefined,
): void {
  if (maxMigrationIndex === undefined) {
    runSqliteMigrations(sqlite, path.resolve(process.cwd(), "drizzle"));
    return;
  }

  const partialDirectory = buildPartialMigrationsFolder(maxMigrationIndex);
  try {
    runSqliteMigrations(sqlite, partialDirectory);
  } finally {
    fs.rmSync(partialDirectory, { recursive: true, force: true });
  }
}

export async function createIsolatedTestDb(options?: { maxMigrationIndex?: number }) {
  const sqlite = openSqliteConnection(":memory:", { foreignKeys: false });
  registerUnicodeCaseFold(sqlite);
  const db = drizzle(sqlite, { schema });
  let closed = false;

  migrateIsolatedDatabase(sqlite, options?.maxMigrationIndex);

  return {
    db,
    sqlite,
    close() {
      if (closed) {
        return;
      }

      sqlite.close();
      closed = true;
    },
  };
}
