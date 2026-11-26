import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./Schema";
import { openSqliteConnection, runSqliteMigrations } from "./SqliteConnection.server";
import { registerUnicodeCaseFold } from "./UnicodeCaseFold.server";

const sqlite = openSqliteConnection(process.env.DATABASE_URL || "sqlite.db");
registerUnicodeCaseFold(sqlite);
const db = drizzle(sqlite, { schema });
let isSqliteClosed = false;

export const getDb = createServerOnlyFn(() => db);

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function migrateDb(migrationsFolder: string) {
  runSqliteMigrations(sqlite, migrationsFolder);
}

export function closeDb() {
  if (isSqliteClosed) {
    return;
  }

  sqlite.close();
  isSqliteClosed = true;
}
