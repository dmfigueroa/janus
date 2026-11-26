import assert from "node:assert/strict";
import type { SqliteStateSnapshot } from "./SqliteCheckRep";

const SECOND_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const MILLIS_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const TIMESTAMP_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "lastWatchedAt",
  "lastItemAddedAt",
  "pausedAt",
  "addedAt",
  "created_at",
  "updated_at",
  "last_watched_at",
  "last_item_added_at",
  "paused_at",
  "added_at",
]);

export interface CanonicalResponse {
  kind: "ok" | "toolError" | "rpcInvalidParams";
  structured?: unknown;
  errorText?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function canonicalizeJsonValue(
  value: unknown,
  fixtureTimestamps: ReadonlySet<string>,
  key?: string,
): unknown {
  if (typeof value === "string") return canonicalizeStringField(value, fixtureTimestamps, key);
  return canonicalizeContainer(value, fixtureTimestamps);
}

function canonicalizeContainer(value: unknown, fixtureTimestamps: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJsonValue(entry, fixtureTimestamps));
  }
  return isRecord(value) ? canonicalizeObject(value, fixtureTimestamps) : value;
}

function canonicalizeStringField(
  value: string,
  fixtureTimestamps: ReadonlySet<string>,
  key: string | undefined,
): unknown {
  if (key === "nextCursor") return decodeCanonicalCursor(value);
  return isTimestampKey(key) ? canonicalizeTimestamp(value, fixtureTimestamps, key) : value;
}

function isTimestampKey(key: string | undefined): key is string {
  return key !== undefined && TIMESTAMP_KEYS.has(key);
}

function canonicalizeTimestamp(
  value: string,
  fixtureTimestamps: ReadonlySet<string>,
  key: string,
): string {
  if (fixtureTimestamps.has(value)) return value;
  return canonicalizeDynamicTimestamp(value, key);
}

function canonicalizeDynamicTimestamp(value: string, key: string): string {
  if (MILLIS_TIMESTAMP.test(value)) return "<timestamp:ms>";
  if (SECOND_TIMESTAMP.test(value)) return "<timestamp:sec>";
  assert.fail(`Unexpected timestamp format for ${key}: ${value}`);
}

function decodeCanonicalCursor(cursor: string): Record<string, unknown> {
  assert.ok(cursor.length > 0, "nextCursor must be a non-empty string");
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  return sortObjectKeys(decoded) as Record<string, unknown>;
}

function canonicalizeObject(
  input: Record<string, unknown>,
  fixtureTimestamps: ReadonlySet<string>,
): Record<string, unknown> {
  const sortedKeys = Object.keys(input)
    .filter((key) => input[key] !== undefined)
    .sort((left, right) => left.localeCompare(right));
  return Object.fromEntries(
    sortedKeys.map((key) => [key, canonicalizeJsonValue(input[key], fixtureTimestamps, key)]),
  );
}

export function canonicalizeSqliteSnapshot(
  snapshot: SqliteStateSnapshot,
  fixtureTimestamps: ReadonlySet<string>,
): unknown {
  return canonicalizeJsonValue(snapshot, fixtureTimestamps);
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  return isRecord(value) ? sortRecordKeys(value) : value;
}

function sortRecordKeys(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(object)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObjectKeys(object[key])]),
  );
}
