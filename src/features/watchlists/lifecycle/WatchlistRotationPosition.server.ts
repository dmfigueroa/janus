import { sql } from "drizzle-orm";
import { watchlists } from "../../../db/Schema.ts";

export function initialWatchlistLifecycle() {
  return { pausedAt: null, lastWatchedAt: nextRotationPosition() };
}

export function nextRotationPosition() {
  return sql`strftime('%Y-%m-%d %H:%M:%f', MAX(
    julianday('now'),
    COALESCE((SELECT MAX(julianday(${watchlists.lastWatchedAt})) FROM ${watchlists}), 0)
      + 1.0 / 86400000
  ))`;
}
