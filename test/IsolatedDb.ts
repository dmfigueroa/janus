import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "@/db/Schema";
import { openSqliteConnection, runSqliteMigrations } from "@/db/SqliteConnection.server";
import { registerUnicodeCaseFold } from "@/db/UnicodeCaseFold.server";

export type IsolatedTestDb = BetterSQLite3Database<typeof schema>;

export async function createIsolatedTestDb() {
  const sqlite = openSqliteConnection(":memory:", { foreignKeys: false });
  registerUnicodeCaseFold(sqlite);
  const db = drizzle(sqlite, { schema });
  let closed = false;

  runSqliteMigrations(sqlite, path.resolve(process.cwd(), "drizzle"));

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
