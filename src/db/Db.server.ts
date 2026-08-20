import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./Schema";

const sqlite = new Database(process.env.DATABASE_URL || "sqlite.db");
const db = drizzle(sqlite, { schema });
let isSqliteClosed = false;

export const getDb = createServerOnlyFn(() => db);

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function closeDb() {
  if (isSqliteClosed) {
    return;
  }

  sqlite.close();
  isSqliteClosed = true;
}
