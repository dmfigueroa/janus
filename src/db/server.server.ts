import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import * as schema from "./schema";
import { Effect, Context } from "effect";
import { ConfigurationError } from "@/routes/watchlists/watchlist/-errors";

export type DatabaseClient = ReturnType<typeof drizzle<typeof schema>>;

const sqlite = new BetterSqlite3(process.env.DATABASE_URL || "sqlite.db");
const db = drizzle(sqlite, { schema });

export const getDb = createServerOnlyFn(() => db);

export function closeDb(): void {
  if (sqlite.open) {
    sqlite.close();
  }
}

// Effect-based Database Service
export interface DatabaseService {
  readonly client: DatabaseClient;
}

export class Database extends Context.Tag("Database")<Database, DatabaseService>() {}

export function getDatabase(): Effect.Effect<DatabaseClient, ConfigurationError> {
  return Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Database);
    if (service._tag === "Some") {
      return service.value.client;
    }
    // Fallback to global instance
    return db;
  });
}

// For use in server functions that need the database
export function withDatabase<A, E>(
  fn: (db: DatabaseClient) => Effect.Effect<A, E>,
): Effect.Effect<A, E | ConfigurationError> {
  return Effect.gen(function* () {
    const database = yield* getDatabase();
    return yield* fn(database);
  });
}
