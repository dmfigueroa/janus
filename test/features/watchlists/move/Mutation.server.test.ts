import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/Db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;
let moveItemToWatchlistMutation: typeof import("@/features/watchlists/move/Mutation.server").moveItemToWatchlistMutation;
let moveParentAndChildrenToWatchlistMutation: typeof import("@/features/watchlists/move/ParentMutation.server").moveParentAndChildrenToWatchlistMutation;
let moveParentToWatchlistMutation: typeof import("@/features/watchlists/move/ParentMutation.server").moveParentToWatchlistMutation;
let readWatchlistDetailScreen: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;

  const [moveModule, parentMoveModule, readModule] = await Promise.all([
    import("@/features/watchlists/move/Mutation.server"),
    import("@/features/watchlists/move/ParentMutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);

  moveItemToWatchlistMutation = moveModule.moveItemToWatchlistMutation;
  moveParentAndChildrenToWatchlistMutation =
    parentMoveModule.moveParentAndChildrenToWatchlistMutation;
  moveParentToWatchlistMutation = parentMoveModule.moveParentToWatchlistMutation;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("move watchlist item mutation", () => {
  it("blocks move to the same watchlist — duplicate check prevents self-move", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Queue" }).returning();

    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
      })
      .returning();

    const result = await moveItemToWatchlistMutation({
      itemId: item.id,
      destinationWatchlistId: watchlist.id,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("already");
    const detail = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    expect(detail?.items.map((i) => i.title)).toEqual(["The Matrix"]);
  });

  it("returns error when destination watchlist does not exist", async () => {
    const [source] = await db.insert(watchlists).values({ name: "Queue" }).returning();

    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
      })
      .returning();

    const result = await moveItemToWatchlistMutation({
      itemId: item.id,
      destinationWatchlistId: 99999,
    });

    expect(result).toEqual({
      success: false,
      code: "not_found",
      message: "Destination watchlist not found.",
    });
  });

  it("returns error when item does not exist", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Queue" }).returning();

    const result = await moveItemToWatchlistMutation({
      itemId: 99999,
      destinationWatchlistId: watchlist.id,
    });

    expect(result).toEqual({ success: false, code: "not_found", message: "Item not found." });
  });
  it("blocks move to destination that already has the item — returns error, source unchanged, destination unchanged", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const [movedItem] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
        releaseDate: "1999-03-30",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "movie-1",
      source: "tmdb",
      mediaType: "movie",
      title: "The Matrix",
      releaseDate: "1999-03-30",
      isWatched: false,
    });

    const result = await moveItemToWatchlistMutation({
      itemId: movedItem.id,
      destinationWatchlistId: destination.id,
    });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("already");
    expect(sourceDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
    expect(destDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
  });

  describe("position control for custom-ordered destinations", () => {
    it("moves item to end of custom-ordered watchlist — item lands last with correct customRank", async () => {
      const [source, destination] = await db
        .insert(watchlists)
        .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "custom" }])
        .returning();

      const [existingItem] = await db
        .insert(watchlistItems)
        .values({
          watchlistId: destination.id,
          tmdbId: "movie-0",
          source: "tmdb",
          mediaType: "movie",
          title: "Existing",
          customRank: 1,
        })
        .returning();

      const [movedItem] = await db
        .insert(watchlistItems)
        .values({
          watchlistId: source.id,
          tmdbId: "movie-1",
          source: "tmdb",
          mediaType: "movie",
          title: "New Item",
          releaseDate: "2024-01-15",
        })
        .returning();

      const result = await moveItemToWatchlistMutation({
        itemId: movedItem.id,
        destinationWatchlistId: destination.id,
        position: "end",
      });

      expect(result.success).toBe(true);
      const detail = await readWatchlistDetailScreen({
        watchlistId: destination.id,
        unwatchedOnly: false,
      });
      expect(detail?.items.map((i) => i.title)).toEqual(["Existing", "New Item"]);
      const movedItemInDest = detail?.items.find((i) => i.title === "New Item");
      expect(movedItemInDest?.customRank).toBe(2);
      expect(existingItem.customRank).toBe(1);
    });

    it("moves item to beginning of custom-ordered watchlist — item lands first with correct customRank", async () => {
      const [source, destination] = await db
        .insert(watchlists)
        .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "custom" }])
        .returning();

      await db.insert(watchlistItems).values({
        watchlistId: destination.id,
        tmdbId: "movie-0",
        source: "tmdb",
        mediaType: "movie",
        title: "Existing",
        customRank: 1,
      });

      const [movedItem] = await db
        .insert(watchlistItems)
        .values({
          watchlistId: source.id,
          tmdbId: "movie-1",
          source: "tmdb",
          mediaType: "movie",
          title: "New Item",
          releaseDate: "2024-01-15",
        })
        .returning();

      const result = await moveItemToWatchlistMutation({
        itemId: movedItem.id,
        destinationWatchlistId: destination.id,
        position: "beginning",
      });

      expect(result.success).toBe(true);
      const detail = await readWatchlistDetailScreen({
        watchlistId: destination.id,
        unwatchedOnly: false,
      });
      expect(detail?.items.map((i) => i.title)).toEqual(["New Item", "Existing"]);
      const newItemInDest = detail?.items.find((i) => i.title === "New Item");
      expect(newItemInDest?.customRank).toBe(1);
      const existingItemInDest = detail?.items.find((i) => i.title === "Existing");
      expect(existingItemInDest?.customRank).toBe(2);
    });

    it("moves item release-adjacent in custom-ordered watchlist — item lands adjacent to similar release dates", async () => {
      const [source, destination] = await db
        .insert(watchlists)
        .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "custom" }])
        .returning();

      await db.insert(watchlistItems).values([
        {
          watchlistId: destination.id,
          tmdbId: "movie-1",
          source: "tmdb",
          mediaType: "movie",
          title: "Jan 2024",
          releaseDate: "2024-01-15",
          customRank: 1,
        },
        {
          watchlistId: destination.id,
          tmdbId: "movie-2",
          source: "tmdb",
          mediaType: "movie",
          title: "Mar 2024",
          releaseDate: "2024-03-01",
          customRank: 2,
        },
        {
          watchlistId: destination.id,
          tmdbId: "movie-3",
          source: "tmdb",
          mediaType: "movie",
          title: "May 2024",
          releaseDate: "2024-05-10",
          customRank: 3,
        },
      ]);

      const [movedItem] = await db
        .insert(watchlistItems)
        .values({
          watchlistId: source.id,
          tmdbId: "movie-4",
          source: "tmdb",
          mediaType: "movie",
          title: "Feb 2024",
          releaseDate: "2024-02-20",
        })
        .returning();

      const result = await moveItemToWatchlistMutation({
        itemId: movedItem.id,
        destinationWatchlistId: destination.id,
        position: "release-adjacent",
      });

      expect(result.success).toBe(true);
      const detail = await readWatchlistDetailScreen({
        watchlistId: destination.id,
        unwatchedOnly: false,
      });
      const titles = detail?.items.map((i) => i.title) ?? [];
      expect(titles).toEqual(["Jan 2024", "Feb 2024", "Mar 2024", "May 2024"]);
      const movedItemInDest = detail?.items.find((i) => i.title === "Feb 2024");
      expect(movedItemInDest?.customRank).toBe(2);
    });

    it("moves item to release-ordered watchlist — item gets customRank = null", async () => {
      const [source, destination] = await db
        .insert(watchlists)
        .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "release" }])
        .returning();

      const [movedItem] = await db
        .insert(watchlistItems)
        .values({
          watchlistId: source.id,
          tmdbId: "movie-1",
          source: "tmdb",
          mediaType: "movie",
          title: "New Item",
          releaseDate: "2024-01-15",
        })
        .returning();

      const result = await moveItemToWatchlistMutation({
        itemId: movedItem.id,
        destinationWatchlistId: destination.id,
        position: "end",
      });

      expect(result.success).toBe(true);
      const detail = await readWatchlistDetailScreen({
        watchlistId: destination.id,
        unwatchedOnly: false,
      });
      expect(detail?.items.map((i) => i.title)).toEqual(["New Item"]);
      const movedItemInDest = detail?.items.find((i) => i.title === "New Item");
      expect(movedItemInDest?.customRank).toBeNull();
    });
  });

  it("moves single item from source to destination — item present in destination, absent from source, stats updated on both", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const [movedItem] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
        releaseDate: "1999-03-30",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "movie-2",
      source: "tmdb",
      mediaType: "movie",
      title: "Keep Me",
      releaseDate: "2024-01-01",
      isWatched: false,
    });

    const result = await moveItemToWatchlistMutation({
      itemId: movedItem.id,
      destinationWatchlistId: destination.id,
    });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });

    expect(result).toEqual({
      success: true,
      movedCount: 1,
      message: expect.stringContaining("The Matrix"),
    });
    expect(sourceDetail?.items.map((item) => item.title)).toEqual(["Keep Me"]);
    expect(sourceDetail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 0,
    });
    expect(destDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
    expect(destDetail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 1,
    });
  });
});

describe("move watchlist parent mutation", () => {
  it("moves a parent and all children to destination — all siblings present in destination, absent from source", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const parentId = "tmdb:42";
    const [parent] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "tv-42",
        source: "tmdb",
        mediaType: "episode",
        title: "Breaking Bad",
        parentId,
        parentTitle: "Breaking Bad",
        isWatched: false,
      })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: source.id,
        tmdbId: "tv-42-s1e1",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId,
        parentTitle: "Breaking Bad",
        season: 1,
        episode: "1",
        isWatched: true,
      },
      {
        watchlistId: source.id,
        tmdbId: "tv-42-s1e2",
        source: "tmdb",
        mediaType: "episode",
        title: "Cat's in the Bag",
        parentId,
        parentTitle: "Breaking Bad",
        season: 1,
        episode: "2",
        isWatched: false,
      },
    ]);

    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "movie-99",
      source: "tmdb",
      mediaType: "movie",
      title: "Unrelated Movie",
      isWatched: false,
    });

    const result = await moveParentAndChildrenToWatchlistMutation({
      itemId: parent.id,
      destinationWatchlistId: destination.id,
    });

    expect(result).toMatchObject({ success: true, movedCount: 3 });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    expect(sourceDetail?.items.map((i) => i.title)).toEqual(["Unrelated Movie"]);

    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });
    const destTitles = destDetail?.items.map((i) => i.title) ?? [];
    expect(destTitles).toContain("Breaking Bad");
    expect(destTitles).toContain("Pilot");
    expect(destTitles).toContain("Cat's in the Bag");
    expect(destTitles.length).toBe(3);
  });

  it("rejects whole move if any sibling already exists in destination — source unchanged, destination unchanged", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const parentId = "tmdb:42";
    const [parent] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "tv-42",
        source: "tmdb",
        mediaType: "episode",
        title: "Breaking Bad",
        parentId,
        parentTitle: "Breaking Bad",
        isWatched: false,
      })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: source.id,
        tmdbId: "tv-42-s1e1",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId,
        parentTitle: "Breaking Bad",
        season: 1,
        episode: "1",
        isWatched: true,
      },
      {
        watchlistId: source.id,
        tmdbId: "tv-42-s1e2",
        source: "tmdb",
        mediaType: "episode",
        title: "Cat's in the Bag",
        parentId,
        parentTitle: "Breaking Bad",
        season: 1,
        episode: "2",
        isWatched: false,
      },
    ]);

    await db.insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "tv-42-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Breaking Bad",
      season: 1,
      episode: "1",
      isWatched: false,
    });

    const result = await moveParentAndChildrenToWatchlistMutation({
      itemId: parent.id,
      destinationWatchlistId: destination.id,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("already");

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const sourceTitles = sourceDetail?.items.map((i) => i.title) ?? [];
    expect(sourceTitles).toContain("Breaking Bad");
    expect(sourceTitles).toContain("Pilot");
    expect(sourceTitles).toContain("Cat's in the Bag");
    expect(sourceTitles.length).toBe(3);

    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });
    const destTitles = destDetail?.items.map((i) => i.title) ?? [];
    expect(destTitles).toEqual(["Pilot"]);
    expect(destTitles.length).toBe(1);
  });

  it("does not affect single-item move — moving a child with the single-item mutation moves only that row", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const parentId = "tmdb:42";
    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-42",
      source: "tmdb",
      mediaType: "episode",
      title: "Breaking Bad",
      parentId,
      parentTitle: "Breaking Bad",
      isWatched: false,
    });

    const [child] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "tv-42-s1e1",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId,
        parentTitle: "Breaking Bad",
        season: 1,
        episode: "1",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-42-s1e2",
      source: "tmdb",
      mediaType: "episode",
      title: "Cat's in the Bag",
      parentId,
      parentTitle: "Breaking Bad",
      season: 1,
      episode: "2",
      isWatched: false,
    });

    const result = await moveItemToWatchlistMutation({
      itemId: child.id,
      destinationWatchlistId: destination.id,
    });

    expect(result).toMatchObject({ success: true, movedCount: 1 });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const sourceTitles = sourceDetail?.items.map((i) => i.title) ?? [];
    expect(sourceTitles).toContain("Breaking Bad");
    expect(sourceTitles).toContain("Cat's in the Bag");
    expect(sourceTitles).not.toContain("Pilot");
    expect(sourceTitles.length).toBe(2);

    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });
    expect(destDetail?.items.map((i) => i.title)).toEqual(["Pilot"]);
    expect(destDetail?.items.length).toBe(1);
  });

  it("returns error when moved item has no parentId", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
      })
      .returning();

    const result = await moveParentAndChildrenToWatchlistMutation({
      itemId: item.id,
      destinationWatchlistId: destination.id,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Item has no parent group.");
  });
});

describe("move parent to watchlist by parent ID mutation", () => {
  it("moves a parent group selected by watchlist ID and parent ID", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const parentId = "tmdb:55";
    await db.insert(watchlistItems).values([
      {
        watchlistId: source.id,
        tmdbId: "tv-55-s1e1",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId,
        parentTitle: "Series 55",
      },
      {
        watchlistId: source.id,
        tmdbId: "tv-55-s1e2",
        source: "tmdb",
        mediaType: "episode",
        title: "Finale",
        parentId,
        parentTitle: "Series 55",
      },
    ]);

    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "movie-99",
      source: "tmdb",
      mediaType: "movie",
      title: "Unrelated Movie",
    });

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId,
      destinationWatchlistId: destination.id,
    });

    expect(result).toMatchObject({ success: true, movedCount: 2 });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    expect(sourceDetail?.items.map((i) => i.title)).toEqual(["Unrelated Movie"]);

    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });
    expect(destDetail?.items.map((i) => i.title)).toEqual(["Pilot", "Finale"]);
  });

  it("blocks parent move when a sibling already exists in the destination", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const parentId = "tmdb:55";
    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-55-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Series 55",
    });
    await db.insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "tv-55-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Series 55",
    });

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId,
      destinationWatchlistId: destination.id,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("already");

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    expect(sourceDetail?.items.map((i) => i.title)).toEqual(["Pilot"]);
  });

  it("returns not found when the parent ID has no items in the source watchlist", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId: "tmdb:missing",
      destinationWatchlistId: destination.id,
    });

    expect(result).toEqual({
      success: false,
      code: "not_found",
      message: "Parent not found in this watchlist.",
    });
  });

  it("returns not found when the destination watchlist does not exist", async () => {
    const [source] = await db.insert(watchlists).values({ name: "Queue" }).returning();

    const parentId = "tmdb:55";
    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-55-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Series 55",
    });

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId,
      destinationWatchlistId: 99999,
    });

    expect(result).toEqual({
      success: false,
      code: "not_found",
      message: "Destination watchlist not found.",
    });
  });

  it("requires an insertion position for a custom-ordered destination", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "custom" }])
      .returning();

    const parentId = "tmdb:55";
    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-55-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Series 55",
    });

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId,
      destinationWatchlistId: destination.id,
    });

    expect(result).toEqual({
      success: false,
      code: "insertion_choice_required",
      message: "Choose where to insert this item in the custom order.",
    });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    expect(sourceDetail?.items.map((i) => i.title)).toEqual(["Pilot"]);
  });

  it("honors an explicit insertion position for a custom-ordered destination", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched", itemOrderMode: "custom" }])
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "movie-0",
      source: "tmdb",
      mediaType: "movie",
      title: "Existing",
      customRank: 1,
    });

    const parentId = "tmdb:55";
    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "tv-55-s1e1",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Series 55",
    });

    const result = await moveParentToWatchlistMutation({
      watchlistId: source.id,
      parentId,
      destinationWatchlistId: destination.id,
      position: "beginning",
    });

    expect(result.success).toBe(true);
    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });
    expect(destDetail?.items.map((i) => i.title)).toEqual(["Pilot", "Existing"]);
  });
});
