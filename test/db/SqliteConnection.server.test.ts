import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  checkForeignKeys,
  openSqliteConnection,
  runSqliteMigrations,
} from "@/db/SqliteConnection.server";
import { scrubSqliteOrphans } from "@/db/ScrubOrphans.server";
import { registerUnicodeCaseFold } from "@/db/UnicodeCaseFold.server";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

const temporaryDirectories: string[] = [];

function createTempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createTempFileDb() {
  const directory = createTempDir("janus-sqlite-contract-");
  const databasePath = path.join(directory, "janus.sqlite");
  const sqlite = openSqliteConnection(databasePath, { foreignKeys: false });
  registerUnicodeCaseFold(sqlite);
  runSqliteMigrations(sqlite, path.resolve(process.cwd(), "drizzle"));
  const db = drizzle(sqlite, { schema });
  return {
    databasePath,
    sqlite,
    db,
    close() {
      sqlite.close();
    },
  };
}

function holdWriteLockInChildProcess(databasePath: string, holdMilliseconds: number) {
  return new Promise<{ waitForExit: () => Promise<number | null> }>((resolve, reject) => {
    const script = `
      const Database = require("better-sqlite3");
      const sqlite = new Database(process.argv[1], { timeout: 5000 });
      sqlite.exec("BEGIN IMMEDIATE; UPDATE watchlists SET name = name WHERE id = -1;");
      process.stdout.write("locked\\n");
      setTimeout(() => {
        sqlite.exec("COMMIT;");
        sqlite.close();
        process.exit(0);
      }, Number(process.argv[2]));
    `;
    const child = spawn(process.execPath, ["-e", script, databasePath, String(holdMilliseconds)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("locked")) {
        resolve({
          waitForExit: () =>
            new Promise((done) => {
              if (child.exitCode !== null) done(child.exitCode);
              else child.once("exit", (code) => done(code));
            }),
        });
      }
    });
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Lock holder exited early (${code}): ${stderr}`));
      }
    });
  });
}

afterEach(() => {
  dbState.db = undefined;
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()!;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("shared SQLite connection contract", () => {
  it("enforces foreign_keys, busy_timeout, and WAL pragmas on file-backed connections", () => {
    const directory = createTempDir("janus-pragmas-");
    const databasePath = path.join(directory, "contract.sqlite");
    const sqlite = openSqliteConnection(databasePath);

    try {
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(SQLITE_BUSY_TIMEOUT_MS);
      expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      sqlite.close();
    }
  });

  it("enforces foreign_keys and busy_timeout on in-memory isolated test databases", async () => {
    const testDb = await createIsolatedTestDb();
    try {
      expect(testDb.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(testDb.sqlite.pragma("busy_timeout", { simple: true })).toBe(SQLITE_BUSY_TIMEOUT_MS);
      expect(checkForeignKeys(testDb.sqlite)).toEqual([]);
    } finally {
      testDb.close();
    }
  });

  it("rejects inserts referencing nonexistent parent IDs", async () => {
    const testDb = await createIsolatedTestDb();
    try {
      expect(() =>
        testDb.db
          .insert(schema.watchlistItems)
          .values({
            watchlistId: 999_999,
            tmdbId: "invalid-parent",
            source: "tmdb",
            mediaType: "movie",
            title: "Orphan Candidate",
          })
          .run(),
      ).toThrow(/FOREIGN KEY constraint failed/);

      expect(() =>
        testDb.db
          .insert(schema.lineupWatchlists)
          .values({ lineupId: 999_999, watchlistId: 999_999 })
          .run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      testDb.close();
    }
  });

  it("keeps foreign_keys OFF outside Drizzle table-rebuild migrations and re-enables ON afterwards", () => {
    const migrationsDir = createTempDir("janus-rebuild-migration-");
    fs.mkdirSync(path.join(migrationsDir, "meta"));
    fs.writeFileSync(
      path.join(migrationsDir, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          { idx: 0, version: "6", when: 1, tag: "0000_init", breakpoints: true },
          { idx: 1, version: "6", when: 2, tag: "0001_rebuild_parent", breakpoints: true },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(migrationsDir, "0000_init.sql"),
      [
        "CREATE TABLE parents (id integer PRIMARY KEY NOT NULL);",
        "CREATE TABLE children (id integer PRIMARY KEY NOT NULL, parent_id integer NOT NULL REFERENCES parents(id) ON DELETE CASCADE);",
        "INSERT INTO parents (id) VALUES (1);",
        "INSERT INTO children (id, parent_id) VALUES (10, 1);",
      ].join("--> statement-breakpoint\n"),
    );
    fs.writeFileSync(
      path.join(migrationsDir, "0001_rebuild_parent.sql"),
      [
        "PRAGMA foreign_keys=OFF;",
        "CREATE TABLE __new_parents (id integer PRIMARY KEY NOT NULL, label text DEFAULT 'ok' NOT NULL);",
        "INSERT INTO __new_parents (id) SELECT id FROM parents;",
        "DROP TABLE parents;",
        "ALTER TABLE __new_parents RENAME TO parents;",
        "PRAGMA foreign_keys=ON;",
      ].join("--> statement-breakpoint\n"),
    );

    const sqlite = openSqliteConnection(":memory:");
    try {
      runSqliteMigrations(sqlite, migrationsDir);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(checkForeignKeys(sqlite)).toEqual([]);
      expect(sqlite.prepare("SELECT id, parent_id FROM children").all()).toEqual([
        { id: 10, parent_id: 1 },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("fails guarded migration when foreign_key_check finds orphans and restores foreign_keys = ON", () => {
    const testDb = createTempFileDb();
    try {
      testDb.sqlite.pragma("foreign_keys = OFF");
      testDb.sqlite
        .prepare(
          "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title) VALUES(77, 999999, 'bad', 'tmdb', 'movie', 'Orphan')",
        )
        .run();

      expect(() =>
        runSqliteMigrations(testDb.sqlite, path.resolve(process.cwd(), "drizzle")),
      ).toThrow(/foreign_key_check found 1 violation/);
      expect(testDb.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      testDb.close();
    }
  });
});

describe("cascading deletes and IMMEDIATE write transactions", () => {
  it("cascades watchlist_items and lineup_watchlists on deleteWatchlist, mergeWatchlists, and deleteLineup", async () => {
    const testDb = await createIsolatedTestDb();
    dbState.db = testDb.db;

    try {
      const [{ deleteWatchlistMutation }, { mergeWatchlistsMutation }, lineupsModule] =
        await Promise.all([
          import("@/features/watchlists/delete/DeleteWatchlist.server"),
          import("@/features/watchlists/merge/Mutation.server"),
          import("@/features/lineups/manage/LineupConfiguration.server"),
        ]);

      const deleteList = await createTestWatchlist(testDb.db, { name: "To Delete" });
      await createTestWatchlistItem(testDb.db, { watchlistId: deleteList.id, tmdbId: "del-1" });
      const keepList = await createTestWatchlist(testDb.db, { name: "Merge Target" });
      const mergeSource = await createTestWatchlist(testDb.db, { name: "Merge Source" });
      await createTestWatchlistItem(testDb.db, { watchlistId: mergeSource.id, tmdbId: "src-1" });

      const firstLineup = await lineupsModule.createLineup("Delete Cascade Lineup");
      const secondLineup = await lineupsModule.createLineup("Lineup To Delete");
      if (!firstLineup.success || !secondLineup.success) {
        throw new Error("Expected lineup creation to succeed");
      }

      await lineupsModule.setLineupWatchlists({ kind: "custom", id: firstLineup.id }, [
        deleteList.id,
        mergeSource.id,
      ]);
      await lineupsModule.setLineupWatchlists({ kind: "custom", id: secondLineup.id }, [
        keepList.id,
      ]);

      expect(await deleteWatchlistMutation({ id: deleteList.id })).toEqual({ success: true });
      expect(
        testDb.db
          .select()
          .from(schema.watchlistItems)
          .where(eq(schema.watchlistItems.watchlistId, deleteList.id))
          .all(),
      ).toEqual([]);
      expect(
        testDb.db
          .select()
          .from(schema.lineupWatchlists)
          .where(eq(schema.lineupWatchlists.watchlistId, deleteList.id))
          .all(),
      ).toEqual([]);

      expect(
        await mergeWatchlistsMutation({
          targetWatchlistId: keepList.id,
          sourceWatchlistIds: [mergeSource.id],
        }),
      ).toEqual({ success: true, targetId: keepList.id });
      expect(
        testDb.db
          .select()
          .from(schema.watchlistItems)
          .where(eq(schema.watchlistItems.watchlistId, mergeSource.id))
          .all(),
      ).toEqual([]);
      expect(
        testDb.db
          .select()
          .from(schema.lineupWatchlists)
          .where(eq(schema.lineupWatchlists.watchlistId, mergeSource.id))
          .all(),
      ).toEqual([]);

      expect(await lineupsModule.deleteLineup({ kind: "custom", id: secondLineup.id })).toEqual({
        success: true,
      });
      expect(
        testDb.db
          .select()
          .from(schema.lineupWatchlists)
          .where(eq(schema.lineupWatchlists.lineupId, secondLineup.id))
          .all(),
      ).toEqual([]);

      expect(checkForeignKeys(testDb.sqlite)).toEqual([]);
    } finally {
      testDb.close();
    }
  });

  it("waits cleanly through a concurrent write lock on mergeWatchlistsMutation and deleteLineup", async () => {
    const fileDb = createTempFileDb();
    dbState.db = fileDb.db;

    try {
      const [{ mergeWatchlistsMutation }, lineupsModule] = await Promise.all([
        import("@/features/watchlists/merge/Mutation.server"),
        import("@/features/lineups/manage/LineupConfiguration.server"),
      ]);

      const target = await createTestWatchlist(fileDb.db, { name: "Concurrent Target" });
      const source = await createTestWatchlist(fileDb.db, { name: "Concurrent Source" });
      await createTestWatchlistItem(fileDb.db, { watchlistId: source.id, tmdbId: "conc-1" });
      const lineup = await lineupsModule.createLineup("Concurrent Lineup");
      if (!lineup.success) throw new Error(lineup.message);
      await lineupsModule.setLineupWatchlists({ kind: "custom", id: lineup.id }, [target.id]);

      const firstLock = await holdWriteLockInChildProcess(fileDb.databasePath, 200);
      const mergeResult = await mergeWatchlistsMutation({
        targetWatchlistId: target.id,
        sourceWatchlistIds: [source.id],
      });
      expect(await firstLock.waitForExit()).toBe(0);
      expect(mergeResult).toEqual({ success: true, targetId: target.id });

      const secondLock = await holdWriteLockInChildProcess(fileDb.databasePath, 200);
      const deleteResult = await lineupsModule.deleteLineup({ kind: "custom", id: lineup.id });
      expect(await secondLock.waitForExit()).toBe(0);
      expect(deleteResult).toEqual({ success: true });
      expect(checkForeignKeys(fileDb.sqlite)).toEqual([]);
    } finally {
      fileDb.close();
    }
  });
});

describe("orphan scrub utility", () => {
  it("supports read-only dry-run and idempotent apply cleanup with foreign_key_check verification", () => {
    const fileDb = createTempFileDb();
    try {
      fileDb.sqlite.prepare("INSERT INTO watchlists(id, name) VALUES(1, 'Valid List')").run();
      fileDb.sqlite
        .prepare(
          "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title) VALUES(10, 1, 'ok-1', 'tmdb', 'movie', 'Valid Movie')",
        )
        .run();
      fileDb.sqlite
        .prepare("INSERT INTO lineups(id, kind, name, rank) VALUES(1, 'custom', 'Valid Lineup', 0)")
        .run();
      fileDb.sqlite
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(1, 1)")
        .run();

      fileDb.sqlite.pragma("foreign_keys = OFF");
      fileDb.sqlite
        .prepare(
          "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title) VALUES(99, 777, 'orphan-1', 'tmdb', 'movie', 'Orphan Movie')",
        )
        .run();
      fileDb.sqlite
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(1, 777)")
        .run();
      fileDb.sqlite
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(888, 1)")
        .run();
      fileDb.sqlite.pragma("foreign_keys = ON");
    } finally {
      fileDb.close();
    }

    const bytesBeforeDryRun = fs.readFileSync(fileDb.databasePath);
    const dryRun = scrubSqliteOrphans(fileDb.databasePath);
    expect(dryRun.mode).toBe("dry-run");
    expect(dryRun.foreignKeyViolationsBefore).toHaveLength(3);
    expect(dryRun.orphansFound).toEqual({ watchlistItems: 1, lineupWatchlists: 2 });
    expect(dryRun.deleted).toEqual({ watchlistItems: 0, lineupWatchlists: 0 });
    expect(fs.readFileSync(fileDb.databasePath)).toEqual(bytesBeforeDryRun);

    const cliDryRunOutput = execFileSync(
      process.execPath,
      [path.resolve("src/db/ScrubOrphans.ts"), "--database", fileDb.databasePath],
      { encoding: "utf8" },
    );
    expect(JSON.parse(cliDryRunOutput)).toMatchObject({
      mode: "dry-run",
      orphansFound: { watchlistItems: 1, lineupWatchlists: 2 },
      deleted: { watchlistItems: 0, lineupWatchlists: 0 },
    });

    const applied = scrubSqliteOrphans(fileDb.databasePath, { apply: true });
    expect(applied.mode).toBe("apply");
    expect(applied.foreignKeyViolationsBefore).toHaveLength(3);
    expect(applied.deleted).toEqual({ watchlistItems: 1, lineupWatchlists: 2 });
    expect(applied.foreignKeyViolationsAfter).toEqual([]);

    const secondApply = scrubSqliteOrphans(fileDb.databasePath, { apply: true });
    expect(secondApply.foreignKeyViolationsBefore).toEqual([]);
    expect(secondApply.orphansFound).toEqual({ watchlistItems: 0, lineupWatchlists: 0 });
    expect(secondApply.deleted).toEqual({ watchlistItems: 0, lineupWatchlists: 0 });
    expect(secondApply.foreignKeyViolationsAfter).toEqual([]);

    const verifyConnection = openSqliteConnection(fileDb.databasePath, { readonly: true });
    try {
      expect(verifyConnection.prepare("SELECT id FROM watchlist_items").all()).toEqual([
        { id: 10 },
      ]);
      expect(
        verifyConnection.prepare("SELECT lineup_id, watchlist_id FROM lineup_watchlists").all(),
      ).toEqual([{ lineup_id: 1, watchlist_id: 1 }]);
      expect(checkForeignKeys(verifyConnection)).toEqual([]);
    } finally {
      verifyConnection.close();
    }
  });

  it("refuses to create a nonexistent database file", () => {
    const missingPath = path.join(createTempDir("janus-missing-"), "missing.sqlite");
    expect(() => scrubSqliteOrphans(missingPath)).toThrow();
    expect(fs.existsSync(missingPath)).toBe(false);
  });
});
