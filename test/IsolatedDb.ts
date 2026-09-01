import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/db/Schema";
import { registerUnicodeCaseFold } from "@/db/UnicodeCaseFold.server";

export type IsolatedTestDb = BetterSQLite3Database<typeof schema>;

export async function createIsolatedTestDb() {
  const sqlite = new Database(":memory:");
  registerUnicodeCaseFold(sqlite);
  const db = drizzle(sqlite, { schema });
  let closed = false;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

  return {
    db,
    close() {
      if (closed) {
        return;
      }

      sqlite.close();
      closed = true;
    },
  };
}
