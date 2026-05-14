import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function ensureDatabaseDirectoryExists(databaseUrl: string) {
  if (databaseUrl === ":memory:" || databaseUrl.startsWith("file:")) {
    return;
  }

  const directory = path.dirname(databaseUrl);
  if (directory === "." || directory === "") {
    return;
  }

  fs.mkdirSync(directory, { recursive: true });
}

const databaseUrl = process.env.DATABASE_URL || "sqlite.db";
ensureDatabaseDirectoryExists(databaseUrl);

const sqlite = new Database(databaseUrl);
const db = drizzle(sqlite, { schema });
let isSqliteClosed = false;

export const getDb = createServerOnlyFn(() => db);

export function closeDb() {
  if (isSqliteClosed) {
    return;
  }

  sqlite.close();
  isSqliteClosed = true;
}
