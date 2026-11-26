import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let createWatchlistMutation: typeof import("@/features/watchlists/create/Mutation.server").createWatchlistMutation;
let listWatchlists: typeof import("@/features/watchlists/Read.server").WatchlistsRead.listScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [createModule, readModule] = await Promise.all([
    import("@/features/watchlists/create/Mutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  createWatchlistMutation = createModule.createWatchlistMutation;
  listWatchlists = readModule.WatchlistsRead.listScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("create watchlist mutation", () => {
  it("creates a watchlist that appears in list reads", async () => {
    await createWatchlistMutation({
      name: "Weekend Movies",
      description: "Shortlist for Friday night",
    });

    await expect(listWatchlists()).resolves.toMatchObject([
      {
        name: "Weekend Movies",
        description: "Shortlist for Friday night",
        stats: {
          totalItems: 0,
          watchedItems: 0,
          progress: 0,
          nextUnwatched: null,
        },
      },
    ]);
  });

  it("supports a custom item order mode", async () => {
    await createWatchlistMutation({ name: "Custom Order List", itemOrderMode: "custom" });

    await expect(listWatchlists()).resolves.toMatchObject([
      { name: "Custom Order List", itemOrderMode: "custom" },
    ]);
  });

  it("sets lastWatchedAt when creating a watchlist", async () => {
    await createWatchlistMutation({ name: "Fresh List" });

    const [summary] = await listWatchlists();
    expect(summary?.lastWatchedAt).toEqual(expect.any(String));
  });

  it("trims names and rejects whitespace-only names at the schema boundary", async () => {
    const { createWatchlistSchema } = await import("@/features/watchlists/create/Mutation");

    expect(createWatchlistSchema.parse({ name: "  Trimmed List  " })).toEqual({
      name: "Trimmed List",
    });
    expect(createWatchlistSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});
