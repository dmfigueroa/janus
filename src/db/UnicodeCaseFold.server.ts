import type Database from "better-sqlite3";

export function registerUnicodeCaseFold(sqlite: Database.Database) {
  sqlite.function("unicode_case_fold", (value: string | null) =>
    value === null ? null : unicodeCaseFold(value),
  );
}

export function unicodeCaseFold(value: string) {
  return value.normalize("NFC").toLowerCase();
}
