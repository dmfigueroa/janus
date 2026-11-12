import { z } from "zod";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Janus MCP endpoint", () => {
  let temporaryDirectory: string;
  let handleMcpRequest: (context: { request: Request }) => Promise<Response>;
  let database: Awaited<typeof import("@/db/Db.server")>;
  let client: Client;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "janus-mcp-"));
    process.env.DATABASE_URL = path.join(temporaryDirectory, "janus.sqlite");

    database = await import("@/db/Db.server");
    await migrate(database.getDb(), { migrationsFolder: path.resolve("drizzle") });
    await database
      .getDb()
      .insert((await import("@/db/Schema")).watchlists)
      .values([
        { name: "Recently Added", description: "New arrivals" },
        { name: "Classics", description: "Worth revisiting" },
      ]);

    ({ mcpPostHandler: handleMcpRequest } = await import("@/routes/mcp"));
    client = new Client({ name: "janus-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://janus.test/mcp"), {
      fetch: async (input, init) => handleMcpRequest({ request: new Request(input, init) }),
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    database?.closeDb();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("preserves custom addition neighbors when a failed operation has an unknown affected count", async () => {
    const addition = await import("@/features/watchlists/add/AddCustomItem.server");
    const operation = vi
      .spyOn(addition, "addCustomItemToWatchlist")
      .mockResolvedValueOnce({ success: true, code: "added", message: "Added", affectedCount: 1 })
      .mockRejectedValueOnce(new Error("private failure"))
      .mockResolvedValueOnce({ success: true, code: "added", message: "Added", affectedCount: 1 });
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await client.callTool({
        name: "add_custom_items_to_watchlists",
        arguments: {
          items: ["First", "Unknown", "Last"].map((title) => ({
            watchlistId: 1,
            title,
            mediaType: "movie",
          })),
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          { index: 0, success: true, affectedCount: 1 },
          { index: 1, success: false, code: "internal_error" },
          { index: 2, success: true, affectedCount: 1 },
        ],
      });
      const content = z
        .object({ results: z.array(z.record(z.unknown())) })
        .parse(result.structuredContent);
      expect(content.results[1]).not.toHaveProperty("affectedCount");
      expect(JSON.stringify(result)).not.toContain("private failure");
      expect(operation).toHaveBeenCalledTimes(3);
    } finally {
      operation.mockRestore();
      logging.mockRestore();
    }
  });

  it("keeps successful removal results around an unexpected batch failure", async () => {
    const removal = await import("@/features/watchlists/remove/Mutation.server");
    const operation = vi
      .spyOn(removal, "removeWatchlistItemMutation")
      .mockResolvedValueOnce({ success: true, removedCount: 1, message: "Removed." })
      .mockRejectedValueOnce(new Error("sensitive failure detail"))
      .mockResolvedValueOnce({ success: true, removedCount: 0, message: "Already removed." });
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await client.callTool({
        name: "remove_watchlist_items",
        arguments: {
          removals: [1, 2, 3].map((watchlistItemId) => ({ watchlistId: 1, watchlistItemId })),
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          { index: 0, success: true, code: "removed", affectedCount: 1 },
          { index: 1, success: false, code: "internal_error" },
          { index: 2, success: true, code: "removed", affectedCount: 0 },
        ],
      });
      expect(JSON.stringify(result)).not.toContain("sensitive failure detail");
      expect(logging).toHaveBeenCalledWith("MCP batch operation failed", { index: 1 });
      expect(operation).toHaveBeenCalledTimes(3);
    } finally {
      operation.mockRestore();
      logging.mockRestore();
    }
  });

  it("discovers and calls list_watchlists through the MCP protocol", async () => {
    const tools = await client.listTools();
    const listWatchlists = tools.tools.find((tool) => tool.name === "list_watchlists");

    expect(listWatchlists).toMatchObject({
      name: "list_watchlists",
      annotations: { readOnlyHint: true },
    });
    expect(listWatchlists?.inputSchema).toMatchObject({
      properties: { pageSize: { maximum: 100 }, cursor: { type: "string" } },
    });
    expect(listWatchlists?.outputSchema).toMatchObject({
      properties: { watchlists: { type: "array" } },
    });

    const result = await client.callTool({
      name: "list_watchlists",
      arguments: { orderBy: "createdAt", order: "asc" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      watchlists: [
        { name: "Recently Added", description: "New arrivals" },
        { name: "Classics", description: "Worth revisiting" },
      ],
    });
  });

  it("manages lineups through explicit MCP references and replacement operations", async () => {
    const tools = (await client.listTools()).tools;
    expect(tools.find((tool) => tool.name === "delete_lineups")?.annotations).toMatchObject({
      destructiveHint: true,
    });
    expect(tools.find((tool) => tool.name === "list_lineups")?.annotations).toMatchObject({
      readOnlyHint: true,
    });
    const created = await client.callTool({
      name: "create_lineups",
      arguments: { lineups: [{ name: "MCP context" }, { name: "movies" }] },
    });
    expect(created.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true },
        { index: 1, success: false },
      ],
    });
    const list = await client.callTool({ name: "list_lineups", arguments: {} });
    const content = list.structuredContent as {
      lineups: Array<{ name: string; reference: { kind: "custom"; id: number } }>;
    };
    const reference = content.lineups.find((lineup) => lineup.name === "MCP context")!.reference;
    expect(reference).toMatchObject({ kind: "custom", id: expect.any(Number) });
    const replacement = await client.callTool({
      name: "set_lineup_watchlists",
      arguments: { reference, watchlistIds: [1, 2] },
    });
    expect(replacement.structuredContent).toMatchObject({ success: true });
    const rejected = await client.callTool({
      name: "set_lineup_watchlists",
      arguments: { reference, watchlistIds: [1, 1] },
    });
    expect(rejected.structuredContent).toMatchObject({
      success: false,
      code: "validation_error",
      message: "Watchlist IDs must be distinct and exist.",
    });
    const detail = await client.callTool({ name: "get_lineup", arguments: { reference } });
    expect(detail.structuredContent).toMatchObject({
      success: true,
      lineup: { configuredCount: 2, eligibleCount: 0 },
    });
    const forbidden = await client.callTool({
      name: "delete_lineups",
      arguments: { lineups: [{ kind: "system", key: "movie" }] },
    });
    expect(forbidden.structuredContent).toMatchObject({
      results: [{ index: 0, success: false, code: "forbidden" }],
    });
    const badOrder = await client.callTool({
      name: "reorder_lineups",
      arguments: { lineups: [reference] },
    });
    expect(badOrder.structuredContent).toMatchObject({ success: false, code: "validation_error" });
    const mixedUpdates = await client.callTool({
      name: "update_lineups",
      arguments: {
        lineups: [
          { reference },
          { reference, enabled: false },
          { reference: { kind: "custom", id: "bad" }, name: "Invalid" },
          { reference, name: "Movies" },
        ],
      },
    });
    expect(mixedUpdates.structuredContent).toMatchObject({
      results: [
        { index: 0, success: false, code: "validation_error" },
        { index: 1, success: true, code: "updated" },
        { index: 2, success: false, code: "validation_error" },
        {
          index: 3,
          success: false,
          code: "validation_error",
          message: "Movies is reserved for an automatic lineup.",
        },
      ],
    });
  });

  it("merges watchlists atomically through the MCP batch contract", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [target, source, newSource] = await database
      .getDb()
      .insert(watchlists)
      .values([
        { name: "Merge target", itemOrderMode: "custom" },
        { name: "Merge source" },
        { name: "New target source" },
      ])
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: target.id,
          tmdbId: "merge-shared",
          source: "tmdb",
          mediaType: "movie",
          title: "Shared",
          customRank: 1,
          isWatched: false,
        },
        {
          watchlistId: source.id,
          tmdbId: "merge-shared",
          source: "tmdb",
          mediaType: "movie",
          title: "Shared",
          isWatched: true,
        },
        {
          watchlistId: source.id,
          tmdbId: "merge-other",
          source: "tmdb",
          mediaType: "movie",
          title: "Other",
        },
        {
          watchlistId: newSource.id,
          tmdbId: "new-target-item",
          source: "tmdb",
          mediaType: "movie",
          title: "New target item",
        },
      ]);
    const tool = (await client.listTools()).tools.find(
      (entry) => entry.name === "merge_watchlists",
    );
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tool?.description).toContain("deleted");
    const result = await client.callTool({
      name: "merge_watchlists",
      arguments: {
        merges: [
          { sourceWatchlistIds: [source.id], targetWatchlistId: target.id },
          { sourceWatchlistIds: [newSource.id, 99999999], newWatchlistName: "Must not exist" },
          { sourceWatchlistIds: [newSource.id], newWatchlistName: "New merged target" },
          {
            sourceWatchlistIds: [target.id],
            targetWatchlistId: target.id,
            newWatchlistName: "Invalid",
          },
          { sourceWatchlistIds: [target.id], targetWatchlistId: "invalid" },
        ],
      },
    });
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          targetWatchlistId: target.id,
          deletedSourceWatchlistIds: [source.id],
        },
        { index: 1, success: false, code: "not_found" },
        {
          index: 2,
          success: true,
          targetWatchlistId: expect.any(Number),
          deletedSourceWatchlistIds: [newSource.id],
        },
        { index: 3, success: false, code: "validation_error" },
        { index: 4, success: false, code: "validation_error" },
      ],
    });
    const items = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, target.id))
      .orderBy(asc(watchlistItems.customRank));
    expect(items.map((item) => [item.title, item.isWatched])).toEqual([
      ["Shared", true],
      ["Other", false],
    ]);
    const remaining = await database.getDb().select().from(watchlists);
    expect(remaining.map((entry) => entry.id)).not.toContain(source.id);
    expect(remaining.map((entry) => entry.id)).not.toContain(newSource.id);
    expect(remaining.map((entry) => entry.name)).not.toContain("Must not exist");
    const newTarget = remaining.find((entry) => entry.name === "New merged target");
    expect(newTarget).toBeDefined();
    expect(
      await database
        .getDb()
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, newTarget!.id)),
    ).toMatchObject([{ title: "New target item" }]);
  });

  it("rolls back target changes when source deletion fails", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [target, source, beforeSource, afterSource] = await database
      .getDb()
      .insert(watchlists)
      .values([
        { name: "Rollback target" },
        { name: "Rollback source" },
        { name: "Before failure" },
        { name: "After failure" },
      ])
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "rollback-item",
      source: "tmdb",
      mediaType: "movie",
      title: "Rollback item",
    });
    const { sql } = await import("drizzle-orm");
    database
      .getDb()
      .run(
        sql.raw(
          `CREATE TRIGGER prevent_merge_delete BEFORE DELETE ON watchlists WHEN OLD.id = ${source.id} BEGIN SELECT RAISE(ABORT, 'test deletion failure'); END`,
        ),
      );
    try {
      const result = await client.callTool({
        name: "merge_watchlists",
        arguments: {
          merges: [
            { sourceWatchlistIds: [beforeSource.id], newWatchlistName: "Before merged" },
            { sourceWatchlistIds: [source.id], targetWatchlistId: target.id },
            { sourceWatchlistIds: [afterSource.id], newWatchlistName: "After merged" },
          ],
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          { index: 0, success: true, code: "merged", deletedSourceWatchlistIds: [beforeSource.id] },
          {
            index: 1,
            success: false,
            code: "internal_error",
            message: "The merge failed. No changes were made for this operation.",
          },
          { index: 2, success: true, code: "merged", deletedSourceWatchlistIds: [afterSource.id] },
        ],
      });
      const remainingWatchlists = await database.getDb().select().from(watchlists);
      expect(remainingWatchlists.map((entry) => entry.id)).not.toContain(beforeSource.id);
      expect(remainingWatchlists.map((entry) => entry.id)).not.toContain(afterSource.id);
      expect(remainingWatchlists.map((entry) => entry.name)).toEqual(
        expect.arrayContaining(["Before merged", "After merged"]),
      );
      expect(
        await database
          .getDb()
          .select()
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, target.id)),
      ).toHaveLength(0);
      expect(
        await database
          .getDb()
          .select()
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, source.id)),
      ).toHaveLength(1);
      expect(
        await database.getDb().select().from(watchlists).where(eq(watchlists.id, source.id)),
      ).toHaveLength(1);
    } finally {
      database.getDb().run(sql.raw("DROP TRIGGER prevent_merge_delete"));
    }
  });

  it("creates a watchlist through the ordered batch lifecycle contract", async () => {
    const tools = await client.listTools();
    const createWatchlists = tools.tools.find((tool) => tool.name === "create_watchlists");

    expect(createWatchlists).toMatchObject({
      name: "create_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(createWatchlists?.inputSchema).toMatchObject({
      properties: { watchlists: { type: "array" } },
    });

    const result = await client.callTool({
      name: "create_watchlists",
      arguments: {
        watchlists: [
          { name: "MCP created", description: "Created through MCP", itemOrderMode: "custom" },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "created",
          message: "Watchlist created.",
          watchlist: {
            id: expect.any(Number),
            name: "MCP created",
            description: "Created through MCP",
            itemOrderMode: "custom",
          },
        },
      ],
    });
  });

  it("adds a TMDB movie from its provider ID using canonical metadata", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP movie additions" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Canonical Movie Title",
          poster_path: "/canonical-poster.jpg",
          release_date: "2024-02-03",
          vote_average: 8.7,
          runtime: 127,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const tools = await client.listTools();
    const addMedia = tools.tools.find((tool) => tool.name === "add_media_to_watchlists");

    expect(addMedia).toMatchObject({
      name: "add_media_to_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(addMedia?.description).toContain("TV additions expand into episodes");
    expect(addMedia?.inputSchema).toMatchObject({
      properties: { additions: { type: "array" } },
    });

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "550",
            mediaType: "movie",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "added",
          watchlistId: watchlist.id,
          provider: "tmdb",
          providerId: "550",
          affectedCount: 1,
        },
      ],
    });
    const [item] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(item).toMatchObject({
      tmdbId: "550",
      title: "Canonical Movie Title",
      releaseDate: "2024-02-03",
      posterPath: "/canonical-poster.jpg",
    });
    fetchMock.mockRestore();
  });

  it("adds supported provider media canonically and preserves mixed-batch outcomes", async () => {
    process.env.RAWG_API_KEY = "test-rawg-key";
    process.env.GOOGLE_BOOKS_API_KEY = "test-google-books-key";
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP canonical providers" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("rawg.io")) {
        return new Response(
          JSON.stringify({ id: 3498, name: "Canonical Game", released: "2013-09-17" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("googleapis.com")) {
        return new Response(
          JSON.stringify({
            id: "book-42",
            volumeInfo: { title: "Canonical Book", publishedDate: "1969-03-01" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/volume/")) {
        return new Response(JSON.stringify({ results: { id: 4050, name: "Canonical Volume" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          error: "OK",
          number_of_total_results: 1,
          results: [{ id: 1, name: "Canonical Issue", issue_number: "1" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: "google_books",
            providerId: "book-42",
            mediaType: "book",
          },
          { watchlistId: watchlist.id, provider: "rawg", providerId: "3498", mediaType: "game" },
          {
            watchlistId: watchlist.id,
            provider: "comicvine",
            providerId: "4050",
            mediaType: "comic",
          },
          { watchlistId: watchlist.id, provider: "anilist", providerId: "1", mediaType: "anime" },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "added", provider: "google_books" },
        { index: 1, success: true, code: "added", provider: "rawg" },
        { index: 2, success: true, code: "added", provider: "comicvine", affectedCount: 1 },
        { index: 3, success: false, code: "unsupported", provider: "anilist" },
      ],
    });
    await expect(
      database
        .getDb()
        .select({
          source: watchlistItems.source,
          title: watchlistItems.title,
          parentTitle: watchlistItems.parentTitle,
        })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "google_books", title: "Canonical Book" }),
        expect.objectContaining({ source: "rawg", title: "Canonical Game" }),
        expect.objectContaining({ source: "comicvine", parentTitle: "Canonical Volume" }),
      ]),
    );
    fetchMock.mockRestore();
  });

  it("expands TMDB TV additions and reports no new episodes on a repeat request", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP TV additions" })
      .returning();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "Canonical Show",
            poster_path: "/show-poster.jpg",
            seasons: [{ season_number: 0 }, { season_number: 1 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            episodes: [
              {
                id: 101,
                name: "Pilot",
                season_number: 1,
                episode_number: 1,
                still_path: null,
                air_date: "2024-01-10",
                vote_average: 7.2,
                runtime: 42,
              },
              {
                id: 102,
                name: "Second Wave",
                season_number: 1,
                episode_number: 2,
                still_path: null,
                air_date: "2024-01-17",
                vote_average: 7.8,
                runtime: 44,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "Canonical Show",
            poster_path: "/show-poster.jpg",
            seasons: [{ season_number: 1 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            episodes: [
              {
                id: 101,
                name: "Pilot",
                season_number: 1,
                episode_number: 1,
                still_path: null,
                air_date: "2024-01-10",
                vote_average: 7.2,
                runtime: 42,
              },
              {
                id: 102,
                name: "Second Wave",
                season_number: 1,
                episode_number: 2,
                still_path: null,
                air_date: "2024-01-17",
                vote_average: 7.8,
                runtime: 44,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const arguments_ = {
      additions: [
        { watchlistId: watchlist.id, provider: "tmdb", providerId: "1399", mediaType: "tv" },
      ],
    };

    const firstResult = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: arguments_,
    });
    const repeatedResult = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: arguments_,
    });

    expect(firstResult.structuredContent).toMatchObject({
      results: [{ success: true, code: "added", affectedCount: 2 }],
    });
    expect(repeatedResult.structuredContent).toMatchObject({
      results: [{ success: true, code: "no_new_items", affectedCount: 0 }],
    });
    fetchMock.mockRestore();
  });

  it("adds selected ComicVine issues in input order to a custom-ordered watchlist", async () => {
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP selected issues", itemOrderMode: "custom" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const issueId = input.toString().match(/issue\/4000-(\d+)/)?.[1];
      if (issueId === "9001") {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      return new Response(
        JSON.stringify({
          error: "OK",
          results: {
            id: Number(issueId),
            name: issueId === "9001" ? "First Selected Issue" : "Second Selected Issue",
            issue_number: issueId === "9001" ? "1" : "2",
            volume: { id: 4050, name: "Canonical Volume" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: "comicvine",
            providerId: "9001",
            mediaType: "comic_issue",
            parent: { title: "Agent supplied context" },
            insertionPosition: "end",
          },
          {
            watchlistId: watchlist.id,
            provider: "comicvine",
            providerId: "9002",
            mediaType: "comic_issue",
            insertionPosition: "end",
          },
          {
            watchlistId: watchlist.id,
            provider: "comicvine",
            providerId: "9001",
            mediaType: "comic_issue",
            insertionPosition: "end",
          },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "added", affectedCount: 1 },
        { index: 1, success: true, code: "added", affectedCount: 1 },
        { index: 2, success: true, code: "duplicate", affectedCount: 0 },
      ],
    });
    await expect(
      database
        .getDb()
        .select({ title: watchlistItems.title })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id))
        .orderBy(asc(watchlistItems.customRank)),
    ).resolves.toEqual([{ title: "First Selected Issue" }, { title: "Second Selected Issue" }]);
    fetchMock.mockRestore();
  });

  it("adds a single ComicVine issue when a read result is fed back with its parent volume", async () => {
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP comic read back" })
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "9001",
      source: "comicvine",
      mediaType: "comic",
      title: "Read Back Issue",
      parentId: "comicvine:4050",
      parentTitle: "Canonical Volume",
      episode: "7",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/volume/")) {
        throw new Error("Volume endpoint should not be reached for a parented comic addition");
      }
      const issueId = url.match(/issue\/4000-(\d+)/)?.[1];
      return new Response(
        JSON.stringify({
          error: "OK",
          results: {
            id: Number(issueId),
            name: "Read Back Issue",
            issue_number: "7",
            volume: { id: 4050, name: "Canonical Volume" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const readResult = await client.callTool({
      name: "get_watchlist",
      arguments: { watchlistId: watchlist.id },
    });
    const item = (readResult.structuredContent as { items: Record<string, unknown>[] }).items[0];

    const addResult = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: item.provider,
            providerId: item.providerId,
            mediaType: item.mediaType,
            parent: item.parent,
          },
        ],
      },
    });

    expect(addResult.structuredContent).toMatchObject({
      results: [{ success: true, code: "duplicate", affectedCount: 0 }],
    });
    fetchMock.mockRestore();
  });

  it("adds a selected TMDB episode using its required parent show ID", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP selected episode" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/season/1")) {
        return new Response(
          JSON.stringify({
            episodes: [
              {
                id: 1002,
                name: "Canonical Episode",
                season_number: 1,
                episode_number: 2,
                still_path: null,
                air_date: "2024-01-17",
                vote_average: 7.8,
                runtime: 44,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          name: "Canonical Show",
          poster_path: "/show.jpg",
          seasons: [{ season_number: 1 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "1002",
            mediaType: "episode",
            parent: { providerId: "1399", title: "Agent supplied title" },
          },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [{ success: true, code: "added", affectedCount: 1 }],
    });
    const [item] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(item).toMatchObject({
      tmdbId: "1002",
      mediaType: "episode",
      title: "Canonical Episode",
      parentId: "tmdb:1399",
      parentTitle: "Canonical Show",
    });
    fetchMock.mockRestore();
  });

  it("rejects invalid TMDB episode parent show IDs", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP malformed episode parent" })
      .returning();

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "1002",
            mediaType: "episode",
            parent: { providerId: "1399junk" },
          },
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "1002",
            mediaType: "episode",
            parent: { providerId: "0" },
          },
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "1002",
            mediaType: "episode",
            parent: { providerId: "9007199254740992" },
          },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        {
          success: false,
          code: "validation_error",
          message: "Parent provider ID must be a TMDB numeric ID.",
          affectedCount: 0,
        },
        {
          success: false,
          code: "validation_error",
          message: "Parent provider ID must be a positive safe integer.",
          affectedCount: 0,
        },
        {
          success: false,
          code: "validation_error",
          message: "Parent provider ID must be a positive safe integer.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("preserves batch order when a missing destination fails beside a valid addition", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP partial additions" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Partial Success",
          poster_path: null,
          release_date: "2024-02-03",
          vote_average: 8.7,
          runtime: 127,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          { watchlistId: watchlist.id, provider: "tmdb", providerId: "551", mediaType: "movie" },
          { watchlistId: 999_999, provider: "tmdb", providerId: "552", mediaType: "movie" },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "added", affectedCount: 1 },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Watchlist not found.",
          affectedCount: 0,
        },
      ],
    });
    fetchMock.mockRestore();
  });

  it("returns per-addition provider failures without discarding successful batch additions", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP provider failure isolation" })
      .returning();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/movie/554")) {
        return new Response(
          JSON.stringify({
            title: "Successful Movie",
            poster_path: null,
            release_date: "2024-02-03",
            vote_average: 8.7,
            runtime: 127,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/tv/1399/season/1")) {
        return new Response(JSON.stringify({ status_code: 503, status_message: "Unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          name: "Unavailable Show",
          poster_path: null,
          seasons: [{ season_number: 1 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          { watchlistId: watchlist.id, provider: "tmdb", providerId: "1399", mediaType: "tv" },
          {
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId: "554",
            mediaType: "movie",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: false, code: "provider_unavailable", affectedCount: 0 },
        { index: 1, success: true, code: "added", affectedCount: 1 },
      ],
    });
    fetchMock.mockRestore();
  });

  it("isolates unexpected addition defects and continues the batch in order", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Independent addition failures" })
      .returning();
    vi.stubEnv("TMDB_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const id = String(input).split("/").at(-1);
      return Response.json({
        title: id === "701" ? "Fail this addition" : "Keep this addition",
        poster_path: null,
      });
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    database
      .getDb()
      .$client.exec(
        "CREATE TEMP TRIGGER fail_one_addition BEFORE INSERT ON watchlist_items WHEN NEW.title = 'Fail this addition' BEGIN SELECT RAISE(ABORT, 'forced defect'); END",
      );
    try {
      const result = await client.callTool({
        name: "add_media_to_watchlists",
        arguments: {
          additions: ["700", "701", "702"].map((providerId) => ({
            watchlistId: watchlist.id,
            provider: "tmdb",
            providerId,
            mediaType: "movie",
          })),
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          { index: 0, success: true, code: "added", affectedCount: 1 },
          { index: 1, success: false, code: "internal_error", affectedCount: 0 },
          { index: 2, success: true, code: "added", affectedCount: 1 },
        ],
      });
      const items = await database
        .getDb()
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id));
      expect(items.map((item) => item.tmdbId)).toEqual(["700", "702"]);
      expect(errorLog).toHaveBeenCalledWith(
        "Provider watchlist addition failed",
        expect.objectContaining({ watchlistId: watchlist.id, provider: "tmdb" }),
      );
    } finally {
      database.getDb().$client.exec("DROP TRIGGER fail_one_addition");
      fetchMock.mockRestore();
      errorLog.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    { provider: "tmdb", mediaType: "movie", configuration: "TMDB_API_KEY" },
    { provider: "google_books", mediaType: "book", configuration: "GOOGLE_BOOKS_API_KEY" },
    { provider: "rawg", mediaType: "game", configuration: "RAWG_API_KEY" },
    { provider: "comicvine", mediaType: "comic", configuration: "COMICVINE_API_KEY" },
  ])(
    "distinguishes missing $provider configuration from an outage",
    async ({ provider, mediaType, configuration }) => {
      vi.stubEnv(configuration, "");
      try {
        const result = await client.callTool({
          name: "add_media_to_watchlists",
          arguments: { additions: [{ watchlistId: 1, provider, mediaType, providerId: "891234" }] },
        });
        expect(result.structuredContent).toMatchObject({
          results: [{ success: false, code: "provider_not_configured", affectedCount: 0 }],
        });
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each([
    { provider: "tmdb", mediaType: "movie", configuration: "TMDB_API_KEY" },
    { provider: "google_books", mediaType: "book", configuration: "GOOGLE_BOOKS_API_KEY" },
    { provider: "rawg", mediaType: "game", configuration: "RAWG_API_KEY" },
    { provider: "comicvine", mediaType: "comic_issue", configuration: "COMICVINE_API_KEY" },
  ])(
    "classifies $provider request and response failures without parsing messages",
    async ({ provider, mediaType, configuration }) => {
      vi.stubEnv(configuration, "test-key");
      const fetchMock = vi.spyOn(globalThis, "fetch");
      try {
        const failureCases = ["http", "network", "json", "schema"];
        for (const failure of failureCases) {
          fetchMock.mockImplementation(async () => {
            if (failure === "network") throw new TypeError("Transport unavailable");
            if (failure === "http") return new Response("Provider failure", { status: 503 });
            if (failure === "json") return new Response("Invalid JSON", { status: 200 });
            return Response.json({ invalid: "provider response" });
          });
          const result = await client.callTool({
            name: "add_media_to_watchlists",
            arguments: {
              additions: [{ watchlistId: 1, provider, mediaType, providerId: "891235" }],
            },
          });
          expect(result.structuredContent).toMatchObject({
            results: [{ success: false, code: "provider_unavailable", affectedCount: 0 }],
          });
        }
      } finally {
        fetchMock.mockRestore();
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(["tv", "episode"])(
    "rejects malformed TMDB season responses before adding %s items",
    async (mediaType) => {
      const { watchlists, watchlistItems } = await import("@/db/Schema");
      const [watchlist] = await database
        .getDb()
        .insert(watchlists)
        .values({ name: `Malformed season ${mediaType}` })
        .returning();
      vi.stubEnv("TMDB_API_KEY", "test-key");
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/season/2")) return Response.json({ invalid: "missing episodes" });
        if (url.endsWith("/season/1"))
          return Response.json({
            episodes: [
              {
                id: 891236,
                name: "Valid episode",
                season_number: 1,
                episode_number: 1,
                still_path: null,
                vote_average: 0,
              },
            ],
          });
        return Response.json({
          name: "Show",
          poster_path: null,
          seasons: [{ season_number: 1 }, { season_number: 2 }],
        });
      });
      try {
        const result = await client.callTool({
          name: "add_media_to_watchlists",
          arguments: {
            additions: [
              {
                watchlistId: watchlist.id,
                provider: "tmdb",
                mediaType,
                providerId: "891236",
                parent: { providerId: "891237" },
              },
            ],
          },
        });
        expect(result.structuredContent).toMatchObject({
          results: [{ success: false, code: "provider_unavailable", affectedCount: 0 }],
        });
        expect(
          await database
            .getDb()
            .select()
            .from(watchlistItems)
            .where(eq(watchlistItems.watchlistId, watchlist.id)),
        ).toHaveLength(0);
      } finally {
        fetchMock.mockRestore();
        vi.unstubAllEnvs();
      }
    },
  );

  it("returns a structured insertion-choice result for custom-ordered destinations", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom additions", itemOrderMode: "custom" })
      .returning();

    const result = await client.callTool({
      name: "add_media_to_watchlists",
      arguments: {
        additions: [
          { watchlistId: watchlist.id, provider: "tmdb", providerId: "553", mediaType: "movie" },
        ],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        {
          success: false,
          code: "insertion_choice_required",
          message: "Choose where to insert this item in the custom order.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("discovers and calls add_custom_items_to_watchlists for source-less items", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom additions" })
      .returning();
    const tools = await client.listTools();
    const addCustomItems = tools.tools.find(
      (tool) => tool.name === "add_custom_items_to_watchlists",
    );

    expect(addCustomItems).toMatchObject({
      name: "add_custom_items_to_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(addCustomItems?.description).toContain("without a provider");
    expect(addCustomItems?.inputSchema).toMatchObject({
      properties: { items: { type: "array" } },
    });
    expect(addCustomItems?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [
          {
            watchlistId: watchlist.id,
            title: "Local Screening",
            mediaType: "movie",
            year: "2025",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "added",
          watchlistId: watchlist.id,
          mediaType: "movie",
          affectedCount: 1,
        },
      ],
    });
    const [item] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(item).toMatchObject({
      source: "custom",
      mediaType: "movie",
      title: "Local Screening",
      releaseDate: "2025",
    });
  });

  it("adds a custom episode with its supplied series metadata", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom episode" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [
          {
            watchlistId: watchlist.id,
            mediaType: "episode",
            parentTitle: "Local Series",
            title: "Pilot",
            episode: "S01E01",
            releaseDate: "2026-10-04",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "added",
          watchlistId: watchlist.id,
          mediaType: "episode",
          affectedCount: 1,
        },
      ],
    });
    const [item] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(item).toMatchObject({
      source: "custom",
      mediaType: "episode",
      title: "Pilot",
      parentId: "custom:local%20series",
      parentTitle: "Local Series",
      episode: "S01E01",
      releaseDate: "2026-10-04",
    });
  });

  it("requires series metadata for custom episodes", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP incomplete custom episode" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [{ watchlistId: watchlist.id, mediaType: "episode", title: "Pilot" }],
      },
    });

    expect(result.structuredContent).toMatchObject({
      results: [
        {
          success: false,
          code: "validation_error",
          message: "Series title is required.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("preserves batch order across custom addition failures", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom partial" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [
          { watchlistId: watchlist.id, title: "Valid pick", mediaType: "book", year: "2020" },
          { watchlistId: watchlist.id, title: "   ", mediaType: "game" },
          { watchlistId: 999_999, title: "Lost", mediaType: "comic" },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "added", mediaType: "book", affectedCount: 1 },
        { index: 1, success: false, code: "validation_error", affectedCount: 0 },
        { index: 2, success: false, code: "not_found", affectedCount: 0 },
      ],
    });
  });

  it("rejects a malformed custom item year with a structured validation result", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom year" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [
          { watchlistId: watchlist.id, title: "Broken Year", mediaType: "movie", year: "20x5" },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: false,
          code: "validation_error",
          message: "Release date must be YYYY or YYYY-MM-DD.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("requires an insertion position for custom additions to custom-ordered watchlists", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom order", itemOrderMode: "custom" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [{ watchlistId: watchlist.id, title: "Needs position", mediaType: "movie" }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          success: false,
          code: "insertion_choice_required",
          message: "Choose where to insert this item in the custom order.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("rejects custom TV additions with the structured unsupported outcome", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP custom TV" })
      .returning();

    const result = await client.callTool({
      name: "add_custom_items_to_watchlists",
      arguments: {
        items: [
          { watchlistId: watchlist.id, title: "Local Series", mediaType: "tv", year: "2025" },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          success: false,
          code: "unsupported",
          message: "TV shows must come from TMDB so Janus can expand them into episodes.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("returns ordered structured validation failures without rolling back valid creates", async () => {
    const result = await client.callTool({
      name: "create_watchlists",
      arguments: {
        watchlists: [{ name: "Valid beside invalid" }, { description: "Name is missing" }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "created",
          watchlist: { name: "Valid beside invalid" },
        },
        {
          index: 1,
          success: false,
          code: "validation_error",
          message: "Name is required",
        },
      ],
    });
  });

  it("updates each requested watchlist independently and preserves input order", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP update", description: "Before update", itemOrderMode: "release" })
      .returning();
    const tools = await client.listTools();
    const updateWatchlists = tools.tools.find((tool) => tool.name === "update_watchlists");

    expect(updateWatchlists).toMatchObject({
      name: "update_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });

    const result = await client.callTool({
      name: "update_watchlists",
      arguments: {
        watchlists: [
          {
            watchlistId: watchlist.id,
            name: "MCP updated",
            description: "After update",
            itemOrderMode: "custom",
          },
          {
            watchlistId: 999_999,
            name: "Missing",
            itemOrderMode: "release",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "updated",
          message: "Watchlist updated.",
          watchlistId: watchlist.id,
        },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Watchlist not found.",
          watchlistId: 999_999,
        },
      ],
    });

    const [updatedWatchlist] = await database
      .getDb()
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, watchlist.id));
    expect(updatedWatchlist).toMatchObject({
      name: "MCP updated",
      description: "After update",
      itemOrderMode: "custom",
    });
  });

  it("deletes requested watchlists without rolling back unrelated operations", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP deletion" })
      .returning();
    const tools = await client.listTools();
    const deleteWatchlists = tools.tools.find((tool) => tool.name === "delete_watchlists");

    expect(deleteWatchlists).toMatchObject({
      name: "delete_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(deleteWatchlists?.description).toContain("Permanently");

    const result = await client.callTool({
      name: "delete_watchlists",
      arguments: { watchlistIds: [watchlist.id, 999_999] },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "deleted",
          message: "Watchlist deleted.",
          watchlistId: watchlist.id,
        },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Watchlist not found.",
          watchlistId: 999_999,
        },
      ],
    });

    const deletedWatchlists = await database
      .getDb()
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, watchlist.id));
    expect(deletedWatchlists).toEqual([]);
  });

  it("skips requested watchlists with Janus's existing recency behavior", async () => {
    const { watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP skip", lastWatchedAt: "2000-01-01 00:00:00" })
      .returning();
    const tools = await client.listTools();
    const skipWatchlists = tools.tools.find((tool) => tool.name === "skip_watchlists");

    expect(skipWatchlists).toMatchObject({
      name: "skip_watchlists",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });

    const result = await client.callTool({
      name: "skip_watchlists",
      arguments: { watchlistIds: [watchlist.id, 999_999] },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "skipped",
          message: "Watchlist skipped.",
          watchlistId: watchlist.id,
        },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Watchlist not found.",
          watchlistId: 999_999,
        },
      ],
    });

    const [skippedWatchlist] = await database
      .getDb()
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, watchlist.id));
    expect(skippedWatchlist?.lastWatchedAt).not.toBe("2000-01-01 00:00:00");
  });

  it("discovers and calls search_watchlists using watchlist names only", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [itemMatch] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Books", description: "Weekend recommendations" })
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: itemMatch.id,
      tmdbId: "weekend-item",
      source: "tmdb",
      mediaType: "movie",
      title: "Weekend at Bernie's",
    });

    const tools = await client.listTools();
    const searchWatchlists = tools.tools.find((tool) => tool.name === "search_watchlists");

    expect(searchWatchlists).toMatchObject({
      name: "search_watchlists",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(searchWatchlists?.inputSchema).toMatchObject({
      properties: {
        query: { type: "string" },
        pageSize: { maximum: 100 },
        cursor: { type: "string" },
      },
    });

    const result = await client.callTool({
      name: "search_watchlists",
      arguments: { query: "RECENT" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      watchlists: [{ id: expect.any(Number), name: "Recently Added" }],
    });
    expect(
      (result.structuredContent as { watchlists: unknown[] }).watchlists[0],
    ).not.toHaveProperty("items");

    const excludedFieldResult = await client.callTool({
      name: "search_watchlists",
      arguments: { query: "weekend" },
    });

    expect(excludedFieldResult.isError).not.toBe(true);
    expect(excludedFieldResult.structuredContent).toMatchObject({ watchlists: [] });
  });

  it("discovers and calls get_watchlist with a paginated watchlist item page", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP detail" })
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "detail-one",
          source: "tmdb",
          mediaType: "movie",
          title: "Detail one",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "detail-two",
          source: "tmdb",
          mediaType: "movie",
          title: "Detail two",
        },
      ]);

    const tools = await client.listTools();
    const getWatchlist = tools.tools.find((tool) => tool.name === "get_watchlist");

    expect(getWatchlist).toMatchObject({
      name: "get_watchlist",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(getWatchlist?.inputSchema).toMatchObject({
      properties: {
        watchlistId: { type: "integer" },
        pageSize: { maximum: 100 },
        cursor: { type: "string" },
      },
    });

    const result = await client.callTool({
      name: "get_watchlist",
      arguments: { watchlistId: String(watchlist.id), pageSize: 1 },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      watchlist: { id: watchlist.id, name: "MCP detail", stats: { totalItems: 2 } },
      items: [{ title: "Detail one" }],
      nextCursor: expect.any(String),
    });

    const firstPage = result.structuredContent as {
      items: Array<{ id: number }>;
      nextCursor: string;
    };
    const secondPage = await client.callTool({
      name: "get_watchlist",
      arguments: { watchlistId: watchlist.id, pageSize: 1, cursor: firstPage.nextCursor },
    });

    expect(secondPage.structuredContent).toMatchObject({ items: [{ title: "Detail two" }] });
    expect(
      (secondPage.structuredContent as { items: Array<{ id: number }> }).items[0]?.id,
    ).not.toBe(firstPage.items[0]?.id);
  });

  it("finds a watchlist item by its explicit Janus identity", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP selectors" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "selector-item",
        source: "tmdb",
        mediaType: "movie",
        title: "Selected item",
      })
      .returning();

    const tools = await client.listTools();
    const findWatchlistItems = tools.tools.find((tool) => tool.name === "find_watchlist_items");

    expect(findWatchlistItems).toMatchObject({
      name: "find_watchlist_items",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(findWatchlistItems?.description).toContain(
      "case-insensitive title, parent-title, and episode",
    );
    expect(findWatchlistItems?.inputSchema).toMatchObject({
      properties: {
        watchlistId: { type: "integer" },
        watchlistItemId: { type: "integer" },
      },
    });
    expect(findWatchlistItems?.inputSchema.properties).not.toHaveProperty("id");

    const result = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, watchlistItemId: item.id },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [
        {
          id: item.id,
          watchlistId: watchlist.id,
          provider: "tmdb",
          providerId: "selector-item",
          title: "Selected item",
        },
      ],
    });
  });

  it("finds a watchlist item by explicit provider identity", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Provider selectors" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "provider-item",
        source: "rawg",
        mediaType: "game",
        title: "Provider selected item",
      })
      .returning();

    const tools = await client.listTools();
    const findWatchlistItems = tools.tools.find((tool) => tool.name === "find_watchlist_items");

    expect(findWatchlistItems?.inputSchema).toMatchObject({
      properties: {
        provider: { type: "string" },
        providerId: { type: "string" },
        mediaType: { type: "string" },
      },
    });
    expect(findWatchlistItems?.inputSchema.properties).not.toHaveProperty("id");

    const result = await client.callTool({
      name: "find_watchlist_items",
      arguments: {
        watchlistId: watchlist.id,
        provider: "rawg",
        providerId: "provider-item",
        mediaType: "game",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ id: item.id, provider: "rawg", providerId: "provider-item" }],
    });
  });

  it("finds watchlist items with the same text matching as the UI", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Text selectors" })
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "title-match",
          source: "tmdb",
          mediaType: "movie",
          title: "Captain Text",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "parent-match",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "series-text",
          parentTitle: "Textual Series",
          episode: "S01E01",
        },
      ]);

    const titleResult = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, query: "CAPTAIN" },
    });
    const parentResult = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, query: "textual" },
    });
    const episodeResult = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, query: "01" },
    });

    expect(titleResult.structuredContent).toMatchObject({
      items: [{ title: "Captain Text" }],
    });
    expect(parentResult.structuredContent).toMatchObject({
      items: [{ title: "Pilot", parent: { title: "Textual Series" } }],
    });
    expect(episodeResult.structuredContent).toMatchObject({
      items: [{ title: "Pilot", episode: "S01E01" }],
    });
  });

  it("collapses matching watchlist items into title results when requested", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Collapsed titles" })
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "show-episode-one",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "show-identity",
          parentTitle: "Collapsed Show",
          episode: "S01E01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "show-episode-two",
          source: "tmdb",
          mediaType: "episode",
          title: "Finale",
          parentId: "show-identity",
          parentTitle: "Collapsed Show",
          episode: "S01E02",
        },
      ]);

    const tools = await client.listTools();
    const findWatchlistItems = tools.tools.find((tool) => tool.name === "find_watchlist_items");

    expect(findWatchlistItems?.description).toContain('resultView: "items" | "titles"');
    expect(findWatchlistItems?.inputSchema).toMatchObject({
      properties: { resultView: { enum: ["items", "titles"] } },
    });

    const result = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, query: "collapsed", resultView: "titles" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      titles: [
        {
          title: "Collapsed Show",
          provider: "tmdb",
          providerId: "show-identity",
          mediaType: "episode",
          matchingItemCount: 2,
        },
      ],
    });

    const watchlistResult = await client.callTool({
      name: "get_watchlist",
      arguments: { watchlistId: watchlist.id, resultView: "titles" },
    });

    expect(watchlistResult.structuredContent).toMatchObject({
      titles: [{ title: "Collapsed Show", matchingItemCount: 2 }],
    });

    const selectedTitleResult = await client.callTool({
      name: "find_watchlist_items",
      arguments: {
        watchlistId: watchlist.id,
        provider: "tmdb",
        providerId: "show-identity",
        mediaType: "episode",
      },
    });

    expect(selectedTitleResult.structuredContent).toMatchObject({
      items: [{ title: "Pilot" }, { title: "Finale" }],
    });
  });

  it("paginates text item searches and returns structured expected failures", async () => {
    const { watchlists, watchlistItems } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "Paginated text selectors" })
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "pagination-one",
          source: "tmdb",
          mediaType: "movie",
          title: "Pagination one",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "pagination-two",
          source: "tmdb",
          mediaType: "movie",
          title: "Pagination two",
        },
      ]);

    const firstPage = await client.callTool({
      name: "find_watchlist_items",
      arguments: { watchlistId: watchlist.id, query: "pagination", pageSize: 1 },
    });
    const firstPageContent = firstPage.structuredContent as {
      items: Array<{ id: number }>;
      nextCursor: string;
    };
    const secondPage = await client.callTool({
      name: "find_watchlist_items",
      arguments: {
        watchlistId: watchlist.id,
        query: "pagination",
        pageSize: 1,
        cursor: firstPageContent.nextCursor,
      },
    });

    expect(firstPageContent.nextCursor).toEqual(expect.any(String));
    expect(
      (secondPage.structuredContent as { items: Array<{ id: number }> }).items[0]?.id,
    ).not.toBe(firstPageContent.items[0]?.id);
    await expect(
      client.callTool({
        name: "find_watchlist_items",
        arguments: {
          watchlistId: watchlist.id,
          query: "different query",
          pageSize: 1,
          cursor: firstPageContent.nextCursor,
        },
      }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      client.callTool({
        name: "find_watchlist_items",
        arguments: { watchlistId: watchlist.id },
      }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      client.callTool({
        name: "get_watchlist",
        arguments: { watchlistId: 999_999 },
      }),
    ).resolves.toMatchObject({ isError: true });
  });

  it("paginates search_watchlists results and rejects invalid inputs", async () => {
    const { watchlists } = await import("@/db/Schema");
    await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "Archive One" }, { name: "Archive Two" }]);

    const firstPage = await client.callTool({
      name: "search_watchlists",
      arguments: { query: "archive", orderBy: "createdAt", order: "asc", pageSize: 1 },
    });
    const firstPageContent = firstPage.structuredContent as {
      watchlists: Array<{ id: number }>;
      nextCursor?: string;
    };

    expect(firstPage.isError).not.toBe(true);
    expect(firstPageContent.watchlists).toHaveLength(1);
    expect(firstPageContent.nextCursor).toEqual(expect.any(String));

    const secondPage = await client.callTool({
      name: "search_watchlists",
      arguments: {
        query: "archive",
        orderBy: "createdAt",
        order: "asc",
        pageSize: 1,
        cursor: firstPageContent.nextCursor,
      },
    });
    const secondPageContent = secondPage.structuredContent as {
      watchlists: Array<{ id: number }>;
    };

    expect(secondPage.isError).not.toBe(true);
    expect(secondPageContent.watchlists).toHaveLength(1);
    expect(secondPageContent.watchlists[0]?.id).not.toBe(firstPageContent.watchlists[0]?.id);

    await expect(
      client.callTool({
        name: "search_watchlists",
        arguments: {
          query: "other",
          orderBy: "createdAt",
          order: "asc",
          pageSize: 1,
          cursor: firstPageContent.nextCursor,
        },
      }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      client.callTool({
        name: "search_watchlists",
        arguments: { query: "archive", pageSize: 101 },
      }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      client.callTool({
        name: "search_watchlists",
        arguments: { query: "archive", cursor: "bad" },
      }),
    ).resolves.toMatchObject({ isError: true });
  });

  it("returns an opaque continuation cursor for another page", async () => {
    const firstPage = await client.callTool({
      name: "list_watchlists",
      arguments: { orderBy: "createdAt", order: "asc", pageSize: 1 },
    });
    const firstPageContent = firstPage.structuredContent as {
      watchlists: Array<{ id: number }>;
      nextCursor?: string;
    };

    expect(firstPageContent.watchlists).toHaveLength(1);
    expect(firstPageContent.nextCursor).toEqual(expect.any(String));

    const secondPage = await client.callTool({
      name: "list_watchlists",
      arguments: {
        orderBy: "createdAt",
        order: "asc",
        pageSize: 1,
        cursor: firstPageContent.nextCursor,
      },
    });
    const secondPageContent = secondPage.structuredContent as {
      watchlists: Array<{ id: number }>;
      nextCursor?: string;
    };

    expect(secondPageContent.watchlists).toHaveLength(1);
    expect(secondPageContent.watchlists[0]?.id).not.toBe(firstPageContent.watchlists[0]?.id);
  });

  it("rejects a page size above the protocol limit", async () => {
    const result = await client.callTool({
      name: "list_watchlists",
      arguments: { pageSize: 101 },
    });

    expect(result.isError).toBe(true);
  });

  it("defaults to a bounded page of 50 watchlist summaries", async () => {
    const { watchlists } = await import("@/db/Schema");
    await database
      .getDb()
      .insert(watchlists)
      .values(
        Array.from({ length: 49 }, (_, index) => ({ name: `Generated watchlist ${index + 1}` })),
      );

    const result = await client.callTool({ name: "list_watchlists", arguments: {} });
    const page = result.structuredContent as {
      watchlists: Array<{ id: number }>;
      nextCursor?: string;
    };

    expect(page.watchlists).toHaveLength(50);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("rejects a malformed continuation cursor", async () => {
    const result = await client.callTool({
      name: "list_watchlists",
      arguments: { cursor: "not-a-cursor" },
    });

    expect(result.isError).toBe(true);
  });

  it("discovers and searches TMDB movies through the MCP protocol", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 550,
              title: "Fight Club",
              poster_path: "/fight-club.jpg",
              backdrop_path: "/fight-club-backdrop.jpg",
              release_date: "1999-10-15",
              vote_average: 8.4,
              overview: "An insomniac office worker forms an underground club.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const tools = await client.listTools();
    const searchMedia = tools.tools.find((tool) => tool.name === "search_media");

    expect(searchMedia).toMatchObject({
      name: "search_media",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(searchMedia?.description).toContain("TMDB for movies and TV");
    expect(searchMedia?.description).toContain("RAWG for games");
    expect(searchMedia?.description).toContain("Google Books for books");
    expect(searchMedia?.description).toContain("ComicVine for comics");
    expect(searchMedia?.description).toContain("AniList for anime and manga");
    expect(searchMedia?.inputSchema).toMatchObject({
      properties: {
        query: { type: "string" },
        mediaType: { enum: ["movie", "tv", "game", "book", "comic", "anime", "manga"] },
        page: { minimum: 1, maximum: 100 },
      },
    });

    const result = await client.callTool({
      name: "search_media",
      arguments: { query: "Fight Club", mediaType: "movie", page: 1 },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          provider: "tmdb",
          providerId: "550",
          mediaType: "movie",
          title: "Fight Club",
          releaseDate: "1999-10-15",
        },
      ],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.themoviedb.org/3/search/movie"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-tmdb-key" }),
      }),
    );
    fetchMock.mockRestore();
  });

  it("routes each active media type to its documented provider", async () => {
    process.env.TMDB_API_KEY = "test-tmdb-key";
    process.env.RAWG_API_KEY = "test-rawg-key";
    process.env.GOOGLE_BOOKS_API_KEY = "test-google-books-key";
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            page: 1,
            total_pages: 1,
            total_results: 1,
            results: [
              {
                id: 1399,
                name: "Game of Thrones",
                poster_path: "/game-of-thrones.jpg",
                backdrop_path: null,
                first_air_date: "2011-04-17",
                vote_average: 8.5,
                overview: "Noble families vie for control.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            count: 1,
            results: [
              {
                id: 3498,
                name: "Grand Theft Auto V",
                background_image: "https://example.test/gta-v.jpg",
                released: "2013-09-17",
                rating: 4.5,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalItems: 1,
            items: [
              {
                id: "book-42",
                volumeInfo: {
                  title: "The Left Hand of Darkness",
                  publishedDate: "1969-03-01",
                  description: "A visitor confronts a world without fixed gender.",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number_of_total_results: 1,
            results: [
              {
                id: 4050,
                name: "Saga",
                start_year: "2012",
                deck: "A space-fantasy comic series.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(
      client.callTool({
        name: "search_media",
        arguments: { query: "Game of Thrones", mediaType: "tv" },
      }),
    ).resolves.toMatchObject({
      structuredContent: { results: [{ provider: "tmdb", providerId: "1399", mediaType: "tv" }] },
    });
    await expect(
      client.callTool({
        name: "search_media",
        arguments: { query: "Grand Theft Auto", mediaType: "game" },
      }),
    ).resolves.toMatchObject({
      structuredContent: { results: [{ provider: "rawg", providerId: "3498", mediaType: "game" }] },
    });
    await expect(
      client.callTool({
        name: "search_media",
        arguments: { query: "Le Guin", mediaType: "book" },
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        results: [{ provider: "google_books", providerId: "book-42", mediaType: "book" }],
      },
    });
    await expect(
      client.callTool({
        name: "search_media",
        arguments: { query: "Saga", mediaType: "comic" },
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        results: [{ provider: "comicvine", providerId: "4050", mediaType: "comic" }],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockRestore();
  });

  it("returns structured, credential-safe outcomes for unavailable provider categories", async () => {
    const animeResult = await client.callTool({
      name: "search_media",
      arguments: { query: "Cowboy Bebop", mediaType: "anime" },
    });

    expect(animeResult.isError).not.toBe(true);
    expect(animeResult.structuredContent).toMatchObject({
      success: false,
      code: "provider_unavailable",
      message: "Anime and manga categories are deprecated while we revisit provider data quality.",
    });

    const rawgApiKey = process.env.RAWG_API_KEY;
    delete process.env.RAWG_API_KEY;
    const gameResult = await client.callTool({
      name: "search_media",
      arguments: { query: "Hades", mediaType: "game" },
    });
    if (rawgApiKey) process.env.RAWG_API_KEY = rawgApiKey;
    else delete process.env.RAWG_API_KEY;

    expect(gameResult.isError).not.toBe(true);
    expect(gameResult.structuredContent).toEqual({
      success: false,
      code: "provider_unavailable",
      message: "Search is temporarily unavailable for this media type. Please try again later.",
    });
  });

  it("reports active provider HTTP failures as unavailable", async () => {
    process.env.RAWG_API_KEY = "test-rawg-key";
    process.env.GOOGLE_BOOKS_API_KEY = "test-google-books-key";
    process.env.COMICVINE_API_KEY = "test-comicvine-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Provider unavailable", { status: 503 }));

    const providerResults = await Promise.all(
      ["game", "book", "comic"].map((mediaType) =>
        client.callTool({
          name: "search_media",
          arguments: { query: "test", mediaType },
        }),
      ),
    );

    expect(providerResults).toEqual(
      Array.from({ length: 3 }, () =>
        expect.objectContaining({
          structuredContent: {
            success: false,
            code: "provider_unavailable",
            message:
              "Search is temporarily unavailable for this media type. Please try again later.",
          },
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });

  it("edits watchlist item metadata through an ordered batch contract", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP item edits" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "edit-item",
        source: "tmdb",
        mediaType: "movie",
        title: "Old title",
        releaseDate: "2024-01-01",
        posterPath: "/old-poster.jpg",
      })
      .returning();

    const tools = await client.listTools();
    const editWatchlistItems = tools.tools.find((tool) => tool.name === "edit_watchlist_items");

    expect(editWatchlistItems).toMatchObject({
      name: "edit_watchlist_items",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(editWatchlistItems?.description).toContain("title, release date, and poster image");
    expect(editWatchlistItems?.inputSchema).toMatchObject({
      properties: { edits: { type: "array" } },
    });

    const result = await client.callTool({
      name: "edit_watchlist_items",
      arguments: {
        edits: [
          {
            watchlistId: watchlist.id,
            watchlistItemId: item.id,
            title: "Edited title",
            releaseDate: "2025-02-03",
            posterImage: "https://images.example.com/edited.jpg",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "edited",
          message: "Watchlist item edited.",
          watchlistId: watchlist.id,
          watchlistItemId: item.id,
        },
      ],
    });

    const [persisted] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.id, item.id));
    expect(persisted).toMatchObject({
      title: "Edited title",
      releaseDate: "2025-02-03",
      posterPath: "https://images.example.com/edited.jpg",
    });
  });

  it("preserves batch order across mixed edit outcomes", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP edit partial" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "edit-partial",
        source: "tmdb",
        mediaType: "movie",
        title: "Valid edit target",
      })
      .returning();

    const result = await client.callTool({
      name: "edit_watchlist_items",
      arguments: {
        edits: [
          {
            watchlistId: watchlist.id,
            watchlistItemId: item.id,
            title: "Changed",
            releaseDate: "2024-01-01",
            posterImage: null,
          },
          {
            watchlistId: watchlist.id,
            watchlistItemId: 999_999,
            title: "Missing",
            releaseDate: null,
            posterImage: null,
          },
          {
            watchlistId: watchlist.id,
            watchlistItemId: item.id,
            title: "   ",
            releaseDate: null,
            posterImage: null,
          },
          {
            watchlistId: watchlist.id,
            watchlistItemId: item.id,
            title: "Bad poster",
            releaseDate: null,
            posterImage: "not-a-url",
          },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "edited", watchlistItemId: item.id },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Watchlist item not found.",
          watchlistItemId: 999_999,
        },
        { index: 2, success: false, code: "validation_error" },
        { index: 3, success: false, code: "validation_error" },
      ],
    });

    const [persisted] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.id, item.id));
    expect(persisted?.title).toBe("Changed");
  });

  it("sets explicit watched state through an ordered batch contract", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP watched state", lastWatchedAt: null })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "watched-item",
        source: "tmdb",
        mediaType: "movie",
        title: "Watchable",
        isWatched: false,
      })
      .returning();

    const tools = await client.listTools();
    const setWatched = tools.tools.find((tool) => tool.name === "set_watchlist_items_watched");

    expect(setWatched).toMatchObject({
      name: "set_watchlist_items_watched",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(setWatched?.inputSchema).toMatchObject({
      properties: { updates: { type: "array" } },
    });

    const result = await client.callTool({
      name: "set_watchlist_items_watched",
      arguments: {
        updates: [
          { watchlistItemId: item.id, isWatched: true },
          { watchlistItemId: item.id, isWatched: false },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "watched_updated", watchlistItemId: item.id },
        { index: 1, success: true, code: "watched_updated", watchlistItemId: item.id },
      ],
    });

    const [persisted] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.id, item.id));
    expect(persisted?.isWatched).toBe(false);
  });

  it("rejects a watched-state update without an explicit isWatched flag", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP watched validation" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "watched-validation",
        source: "tmdb",
        mediaType: "movie",
        title: "Needs state",
      })
      .returning();

    const result = await client.callTool({
      name: "set_watchlist_items_watched",
      arguments: { updates: [{ watchlistItemId: item.id }] },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: false,
          code: "validation_error",
          message: "watchlistItemId and isWatched are required.",
          watchlistItemId: item.id,
        },
      ],
    });
    const [persisted] = await database
      .getDb()
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.id, item.id));
    expect(persisted?.isWatched).toBe(false);
  });

  it("returns ordered watched-state outcomes for missing items", async () => {
    const result = await client.callTool({
      name: "set_watchlist_items_watched",
      arguments: {
        updates: [
          { watchlistItemId: 999_999, isWatched: true },
          { watchlistItemId: 999_998, isWatched: false },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: false,
          code: "not_found",
          message: "Item not found.",
          watchlistItemId: 999_999,
        },
        {
          index: 1,
          success: false,
          code: "not_found",
          message: "Item not found.",
          watchlistItemId: 999_998,
        },
      ],
    });
  });

  it("discovers distinct remove item and parent tools with destructive annotations", async () => {
    const tools = await client.listTools();
    const removeItems = tools.tools.find((tool) => tool.name === "remove_watchlist_items");
    const removeParents = tools.tools.find((tool) => tool.name === "remove_watchlist_parents");

    expect(removeItems).toMatchObject({
      name: "remove_watchlist_items",
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(removeItems?.description).toContain("single item");
    expect(removeItems?.description).toContain("remove_watchlist_parents");
    expect(removeItems?.inputSchema).toMatchObject({
      properties: { removals: { type: "array" } },
    });
    const removeItemsInput = removeItems?.inputSchema;
    const removeItemsProperties = (
      removeItemsInput as {
        properties?: { removals?: { items?: { properties?: Record<string, unknown> } } };
      }
    ).properties?.removals?.items?.properties;
    expect(removeItemsProperties).toMatchObject({
      watchlistId: { type: "integer" },
      watchlistItemId: { type: "integer" },
    });
    expect(removeItemsProperties).not.toHaveProperty("parentId");
    expect(removeItems?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });

    expect(removeParents).toMatchObject({
      name: "remove_watchlist_parents",
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(removeParents?.description).toContain("parent");
    expect(removeParents?.description).toContain("remove_watchlist_items");
    expect(removeParents?.inputSchema).toMatchObject({
      properties: { removals: { type: "array" } },
    });
    const removeParentsInput = removeParents?.inputSchema;
    const removeParentsProperties = (
      removeParentsInput as {
        properties?: { removals?: { items?: { properties?: Record<string, unknown> } } };
      }
    ).properties?.removals?.items?.properties;
    expect(removeParentsProperties).toMatchObject({
      watchlistId: { type: "integer" },
      parentId: { type: "string" },
    });
    expect(removeParentsProperties).not.toHaveProperty("watchlistItemId");
    expect(removeParents?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });
  });

  it("removes a single watchlist item without removing its siblings", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP item removal" })
      .returning();
    const [target, sibling] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "remove-target",
          source: "tmdb",
          mediaType: "movie",
          title: "Target",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "remove-sibling",
          source: "tmdb",
          mediaType: "movie",
          title: "Sibling",
        },
      ])
      .returning();

    const result = await client.callTool({
      name: "remove_watchlist_items",
      arguments: { removals: [{ watchlistId: watchlist.id, watchlistItemId: target.id }] },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "removed",
          watchlistId: watchlist.id,
          watchlistItemId: target.id,
          affectedCount: 1,
        },
      ],
    });

    const remaining = await database
      .getDb()
      .select({ id: watchlistItems.id })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(remaining.map((row) => row.id)).toEqual([sibling.id]);
  });

  it("preserves batch order across item removals and treats stale repeats as success", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP item removal partial" })
      .returning();
    const [target] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "remove-partial",
        source: "tmdb",
        mediaType: "movie",
        title: "Partial target",
      })
      .returning();

    const result = await client.callTool({
      name: "remove_watchlist_items",
      arguments: {
        removals: [
          { watchlistId: watchlist.id, watchlistItemId: target.id },
          { watchlistId: watchlist.id, watchlistItemId: target.id },
          { watchlistId: watchlist.id },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "removed", affectedCount: 1 },
        { index: 1, success: true, code: "removed", affectedCount: 0 },
        {
          index: 2,
          success: false,
          code: "validation_error",
          message: "watchlistId and watchlistItemId are required.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("removes a whole parent group and affects only the selected parent in the watchlist", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist, otherWatchlist] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP parent removal" }, { name: "MCP parent removal other" }])
      .returning();
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "episode-a",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "tmdb:series-a",
          parentTitle: "Series A",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "episode-b",
          source: "tmdb",
          mediaType: "episode",
          title: "Finale",
          parentId: "tmdb:series-a",
          parentTitle: "Series A",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "episode-c",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "tmdb:series-b",
          parentTitle: "Series B",
        },
        {
          watchlistId: otherWatchlist.id,
          tmdbId: "episode-d",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "tmdb:series-a",
          parentTitle: "Series A",
        },
      ]);

    const result = await client.callTool({
      name: "remove_watchlist_parents",
      arguments: { removals: [{ watchlistId: watchlist.id, parentId: "tmdb:series-a" }] },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "removed",
          watchlistId: watchlist.id,
          parentId: "tmdb:series-a",
          affectedCount: 2,
        },
      ],
    });

    const remainingInWatchlist = await database
      .getDb()
      .select({ parentId: watchlistItems.parentId, title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id));
    expect(remainingInWatchlist.map((row) => row.parentId)).toEqual(["tmdb:series-b"]);

    const remainingInOtherWatchlist = await database
      .getDb()
      .select({ parentId: watchlistItems.parentId })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, otherWatchlist.id));
    expect(remainingInOtherWatchlist.map((row) => row.parentId)).toEqual(["tmdb:series-a"]);
  });

  it("preserves batch order across parent removals and reports a stale repeat", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP parent removal partial" })
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "episode-e",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId: "tmdb:series-c",
      parentTitle: "Series C",
    });

    const result = await client.callTool({
      name: "remove_watchlist_parents",
      arguments: {
        removals: [
          { watchlistId: watchlist.id, parentId: "tmdb:series-c" },
          { watchlistId: watchlist.id, parentId: "tmdb:series-c" },
          { watchlistId: watchlist.id },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "removed", parentId: "tmdb:series-c", affectedCount: 1 },
        { index: 1, success: true, code: "removed", parentId: "tmdb:series-c", affectedCount: 0 },
        {
          index: 2,
          success: false,
          code: "validation_error",
          message: "watchlistId and parentId are required.",
          affectedCount: 0,
        },
      ],
    });
  });

  it("discovers reorder_watchlist_items as consequential with explicit selectors", async () => {
    const tools = await client.listTools();
    const reorder = tools.tools.find((tool) => tool.name === "reorder_watchlist_items");

    expect(reorder).toMatchObject({
      name: "reorder_watchlist_items",
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(reorder?.description).toContain("before or after");
    expect(reorder?.description).toContain("custom");
    expect(reorder?.description).toContain("confirm");
    expect(reorder?.inputSchema).toMatchObject({
      properties: { reorders: { type: "array" } },
    });
    const reorderInput = reorder?.inputSchema;
    const reorderProperties = (
      reorderInput as {
        properties?: { reorders?: { items?: { properties?: Record<string, unknown> } } };
      }
    ).properties?.reorders?.items?.properties;
    expect(reorderProperties).toMatchObject({
      watchlistId: { type: "integer" },
      movedItemId: { type: "integer" },
      referenceItemId: { type: "integer" },
      position: { enum: ["before", "after"] },
    });
    expect(reorder?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });
  });

  it("reorders items before and after a reference and persists the order", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP reorder", itemOrderMode: "custom" })
      .returning();
    const [item1, item2, item3, item4] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "r1",
          title: "Item 1",
          mediaType: "movie",
          customRank: 1,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "r2",
          title: "Item 2",
          mediaType: "movie",
          customRank: 2,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "r3",
          title: "Item 3",
          mediaType: "movie",
          customRank: 3,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "r4",
          title: "Item 4",
          mediaType: "movie",
          customRank: 4,
        },
      ])
      .returning();

    const afterResult = await client.callTool({
      name: "reorder_watchlist_items",
      arguments: {
        reorders: [
          {
            watchlistId: watchlist.id,
            movedItemId: item1.id,
            referenceItemId: item3.id,
            position: "after",
          },
        ],
      },
    });

    expect(afterResult.isError).not.toBe(true);
    expect(afterResult.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "reordered",
          watchlistId: watchlist.id,
          movedItemId: item1.id,
          referenceItemId: item3.id,
        },
      ],
    });
    await expect(
      database
        .getDb()
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id))
        .orderBy(watchlistItems.customRank),
    ).resolves.toEqual([{ id: item2.id }, { id: item3.id }, { id: item1.id }, { id: item4.id }]);

    const beforeResult = await client.callTool({
      name: "reorder_watchlist_items",
      arguments: {
        reorders: [
          {
            watchlistId: watchlist.id,
            movedItemId: item4.id,
            referenceItemId: item2.id,
            position: "before",
          },
        ],
      },
    });

    expect(beforeResult.isError).not.toBe(true);
    expect(beforeResult.structuredContent).toMatchObject({
      results: [{ index: 0, success: true, code: "reordered" }],
    });
    await expect(
      database
        .getDb()
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id))
        .orderBy(watchlistItems.customRank),
    ).resolves.toEqual([{ id: item4.id }, { id: item2.id }, { id: item3.id }, { id: item1.id }]);
  });

  it("preserves batch order across reorder anchors and allows partial success", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP reorder partial", itemOrderMode: "custom" })
      .returning();
    const [item1, item2] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "p1",
          title: "Item 1",
          mediaType: "movie",
          customRank: 1,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "p2",
          title: "Item 2",
          mediaType: "movie",
          customRank: 2,
        },
      ])
      .returning();

    const result = await client.callTool({
      name: "reorder_watchlist_items",
      arguments: {
        reorders: [
          {
            watchlistId: watchlist.id,
            movedItemId: item1.id,
            referenceItemId: item2.id,
            position: "before",
          },
          {
            watchlistId: watchlist.id,
            movedItemId: item1.id,
            referenceItemId: 999_999,
            position: "before",
          },
          {
            watchlistId: watchlist.id,
            movedItemId: 999_998,
            referenceItemId: item2.id,
            position: "before",
          },
          {
            watchlistId: watchlist.id,
            movedItemId: item1.id,
            referenceItemId: item1.id,
            position: "before",
          },
          { watchlistId: watchlist.id },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "reordered" },
        { index: 1, success: false, code: "invalid_reference" },
        { index: 2, success: false, code: "invalid_item" },
        { index: 3, success: false, code: "invalid_reorder" },
        {
          index: 4,
          success: false,
          code: "validation_error",
          message: "watchlistId, movedItemId, referenceItemId, and position are required.",
        },
      ],
    });
  });

  it("returns structured reorder failures for a missing and non-custom watchlist", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [releaseWatchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP reorder release", itemOrderMode: "release" })
      .returning();
    const [item] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: releaseWatchlist.id,
        tmdbId: "release-item",
        title: "Release item",
        mediaType: "movie",
      })
      .returning();

    const nonCustom = await client.callTool({
      name: "reorder_watchlist_items",
      arguments: {
        reorders: [
          {
            watchlistId: releaseWatchlist.id,
            movedItemId: item.id,
            referenceItemId: 999_999,
            position: "before",
          },
        ],
      },
    });

    expect(nonCustom.isError).not.toBe(true);
    expect(nonCustom.structuredContent).toMatchObject({
      results: [{ index: 0, success: false, code: "not_custom_mode" }],
    });

    const missing = await client.callTool({
      name: "reorder_watchlist_items",
      arguments: {
        reorders: [{ watchlistId: 999_999, movedItemId: 1, referenceItemId: 2, position: "after" }],
      },
    });

    expect(missing.isError).not.toBe(true);
    expect(missing.structuredContent).toMatchObject({
      results: [{ index: 0, success: false, code: "not_found" }],
    });
  });

  it("sets a complete watchlist order atomically with token protection", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [watchlist] = await database
      .getDb()
      .insert(watchlists)
      .values({ name: "MCP set order", itemOrderMode: "custom" })
      .returning();
    const [item1, item2, item3] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "so1",
          title: "One",
          mediaType: "movie",
          customRank: 1,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "so2",
          title: "Two",
          mediaType: "movie",
          customRank: 2,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "so3",
          title: "Three",
          mediaType: "movie",
          customRank: 3,
        },
      ])
      .returning();

    const readResult = await client.callTool({
      name: "get_watchlist",
      arguments: { watchlistId: watchlist.id },
    });
    expect(readResult.isError).not.toBe(true);
    const readContent = readResult.structuredContent as { orderToken?: string };
    const orderToken = readContent.orderToken;
    expect(orderToken).toEqual(expect.stringMatching(/^sha256:/));

    const setResult = await client.callTool({
      name: "set_watchlist_order",
      arguments: {
        watchlistId: watchlist.id,
        orderedItemIds: [item3.id, item1.id, item2.id],
        expectedOrderToken: orderToken,
      },
    });
    expect(setResult.isError).not.toBe(true);
    expect(setResult.structuredContent).toMatchObject({
      success: true,
      code: "order_set",
      watchlistId: watchlist.id,
    });
    await expect(
      database
        .getDb()
        .select({ id: watchlistItems.id })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id))
        .orderBy(watchlistItems.customRank),
    ).resolves.toEqual([{ id: item3.id }, { id: item1.id }, { id: item2.id }]);

    const staleResult = await client.callTool({
      name: "set_watchlist_order",
      arguments: {
        watchlistId: watchlist.id,
        orderedItemIds: [item1.id, item2.id, item3.id],
        expectedOrderToken: orderToken,
      },
    });
    expect(staleResult.isError).not.toBe(true);
    expect(staleResult.structuredContent).toMatchObject({
      success: false,
      code: "stale_order",
      watchlistId: watchlist.id,
    });
    const setContent = setResult.structuredContent as { orderToken?: string };
    expect((staleResult.structuredContent as { orderToken?: string }).orderToken).toEqual(
      setContent.orderToken,
    );
  });

  it("discovers distinct move item and parent tools with item-versus-parent semantics", async () => {
    const tools = await client.listTools();
    const moveItems = tools.tools.find((tool) => tool.name === "move_watchlist_items");
    const moveParents = tools.tools.find((tool) => tool.name === "move_watchlist_parents");

    expect(moveItems).toMatchObject({
      name: "move_watchlist_items",
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    expect(moveItems?.description).toContain("single item");
    expect(moveItems?.description).toContain("move_watchlist_parents");
    expect(moveItems?.inputSchema).toMatchObject({
      properties: { moves: { type: "array" } },
    });
    const moveItemsInput = moveItems?.inputSchema;
    const moveItemsProperties = (
      moveItemsInput as {
        properties?: { moves?: { items?: { properties?: Record<string, unknown> } } };
      }
    ).properties?.moves?.items?.properties;
    expect(moveItemsProperties).toMatchObject({
      watchlistItemId: { type: "integer" },
      destinationWatchlistId: { type: "integer" },
      position: { enum: ["beginning", "end", "before", "after"] },
    });
    expect(moveItemsProperties).not.toHaveProperty("parentId");
    expect(moveItems?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });

    expect(moveParents).toMatchObject({
      name: "move_watchlist_parents",
      annotations: { readOnlyHint: false, destructiveHint: true },
    });
    expect(moveParents?.description).toContain("parent");
    expect(moveParents?.description).toContain("move_watchlist_items");
    expect(moveParents?.inputSchema).toMatchObject({
      properties: { moves: { type: "array" } },
    });
    const moveParentsInput = moveParents?.inputSchema;
    const moveParentsProperties = (
      moveParentsInput as {
        properties?: { moves?: { items?: { properties?: Record<string, unknown> } } };
      }
    ).properties?.moves?.items?.properties;
    expect(moveParentsProperties).toMatchObject({
      watchlistId: { type: "integer" },
      parentId: { type: "string" },
      destinationWatchlistId: { type: "integer" },
      position: { enum: ["beginning", "end", "before", "after"] },
    });
    expect(moveParentsProperties).not.toHaveProperty("watchlistItemId");
    expect(moveParents?.outputSchema).toMatchObject({
      properties: { results: { type: "array" } },
    });
  });

  it("moves a single watchlist item to a destination and persists the outcome", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP move source" }, { name: "MCP move destination" }])
      .returning();
    const [movedItem] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: source.id,
          tmdbId: "move-target",
          source: "tmdb",
          mediaType: "movie",
          title: "Target",
        },
        {
          watchlistId: source.id,
          tmdbId: "move-sibling",
          source: "tmdb",
          mediaType: "movie",
          title: "Sibling",
        },
      ])
      .returning();

    const result = await client.callTool({
      name: "move_watchlist_items",
      arguments: {
        moves: [{ watchlistItemId: movedItem.id, destinationWatchlistId: destination.id }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "moved",
          watchlistItemId: movedItem.id,
          destinationWatchlistId: destination.id,
          affectedCount: 1,
        },
      ],
    });

    const sourceItems = await database
      .getDb()
      .select({ id: watchlistItems.id, title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, source.id));
    expect(sourceItems.map((row) => row.title)).toEqual(["Sibling"]);

    const destItems = await database
      .getDb()
      .select({ id: watchlistItems.id, title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, destination.id));
    expect(destItems.map((row) => row.title)).toEqual(["Target"]);
  });

  it("preserves batch order across item moves and blocks duplicates without corrupting sources", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP item move partial" }, { name: "MCP item move partial dest" }])
      .returning();
    const [moveTarget, duplicateTarget] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: source.id,
          tmdbId: "move-partial",
          source: "tmdb",
          mediaType: "movie",
          title: "Partial target",
        },
        {
          watchlistId: source.id,
          tmdbId: "move-duplicate",
          source: "tmdb",
          mediaType: "movie",
          title: "Duplicate target",
        },
      ])
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "move-duplicate",
      source: "tmdb",
      mediaType: "movie",
      title: "Existing duplicate",
    });

    const result = await client.callTool({
      name: "move_watchlist_items",
      arguments: {
        moves: [
          { watchlistItemId: moveTarget.id, destinationWatchlistId: destination.id },
          { watchlistItemId: duplicateTarget.id, destinationWatchlistId: destination.id },
          { watchlistItemId: 999_999, destinationWatchlistId: destination.id },
          { destinationWatchlistId: destination.id },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: true, code: "moved", affectedCount: 1 },
        { index: 1, success: false, code: "duplicate" },
        { index: 2, success: false, code: "not_found" },
        {
          index: 3,
          success: false,
          code: "validation_error",
          message: "watchlistItemId and destinationWatchlistId are required.",
          affectedCount: 0,
        },
      ],
    });

    const sourceItems = await database
      .getDb()
      .select({ title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, source.id));
    expect(sourceItems.map((row) => row.title)).toEqual(["Duplicate target"]);
  });

  it("moves an item into a custom-ordered watchlist only when a position is provided", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([
        { name: "MCP custom move source" },
        { name: "MCP custom move destination", itemOrderMode: "custom" },
      ])
      .returning();
    await database.getDb().insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "move-existing",
      source: "tmdb",
      mediaType: "movie",
      title: "Existing",
      customRank: 1,
    });
    const [movedItem] = await database
      .getDb()
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "move-custom",
        source: "tmdb",
        mediaType: "movie",
        title: "Moved",
      })
      .returning();

    const missingPosition = await client.callTool({
      name: "move_watchlist_items",
      arguments: {
        moves: [{ watchlistItemId: movedItem.id, destinationWatchlistId: destination.id }],
      },
    });

    expect(missingPosition.isError).not.toBe(true);
    expect(missingPosition.structuredContent).toMatchObject({
      results: [{ index: 0, success: false, code: "insertion_choice_required" }],
    });

    const withPosition = await client.callTool({
      name: "move_watchlist_items",
      arguments: {
        moves: [
          {
            watchlistItemId: movedItem.id,
            destinationWatchlistId: destination.id,
            position: "beginning",
          },
        ],
      },
    });

    expect(withPosition.isError).not.toBe(true);
    expect(withPosition.structuredContent).toMatchObject({
      results: [{ index: 0, success: true, code: "moved" }],
    });

    await expect(
      database
        .getDb()
        .select({ title: watchlistItems.title })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, destination.id))
        .orderBy(watchlistItems.customRank),
    ).resolves.toEqual([{ title: "Moved" }, { title: "Existing" }]);
  });

  it("moves a whole parent and its children as one operation and reports the affected count", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP parent move source" }, { name: "MCP parent move destination" }])
      .returning();
    const parentId = "tmdb:move-series";
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: source.id,
          tmdbId: "episode-a",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId,
          parentTitle: "Move Series",
        },
        {
          watchlistId: source.id,
          tmdbId: "episode-b",
          source: "tmdb",
          mediaType: "episode",
          title: "Finale",
          parentId,
          parentTitle: "Move Series",
        },
        {
          watchlistId: source.id,
          tmdbId: "episode-c",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId: "tmdb:other-series",
          parentTitle: "Other Series",
        },
      ]);

    const result = await client.callTool({
      name: "move_watchlist_parents",
      arguments: {
        moves: [{ watchlistId: source.id, parentId, destinationWatchlistId: destination.id }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        {
          index: 0,
          success: true,
          code: "moved",
          watchlistId: source.id,
          parentId,
          destinationWatchlistId: destination.id,
          affectedCount: 2,
        },
      ],
    });

    const sourceItems = await database
      .getDb()
      .select({ parentId: watchlistItems.parentId, title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, source.id));
    expect(sourceItems.map((row) => row.parentId)).toEqual(["tmdb:other-series"]);

    const destItems = await database
      .getDb()
      .select({ parentId: watchlistItems.parentId, title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, destination.id));
    expect(destItems.map((row) => row.parentId)).toEqual([parentId, parentId]);
  });

  it("preserves batch order across parent moves and reports duplicate and not-found outcomes", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP parent move partial" }, { name: "MCP parent move partial dest" }])
      .returning();
    const parentId = "tmdb:partial-series";
    await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: source.id,
          tmdbId: "episode-a",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId,
          parentTitle: "Partial Series",
        },
        {
          watchlistId: destination.id,
          tmdbId: "episode-a",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId,
          parentTitle: "Partial Series",
        },
      ]);

    const result = await client.callTool({
      name: "move_watchlist_parents",
      arguments: {
        moves: [
          { watchlistId: source.id, parentId, destinationWatchlistId: destination.id },
          { watchlistId: source.id, parentId, destinationWatchlistId: destination.id },
          {
            watchlistId: source.id,
            parentId: "tmdb:missing",
            destinationWatchlistId: destination.id,
          },
          { watchlistId: source.id },
        ],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [
        { index: 0, success: false, code: "duplicate" },
        { index: 1, success: false, code: "duplicate" },
        { index: 2, success: false, code: "not_found" },
        {
          index: 3,
          success: false,
          code: "validation_error",
          message: "watchlistId, parentId, and destinationWatchlistId are required.",
          affectedCount: 0,
        },
      ],
    });

    const sourceItems = await database
      .getDb()
      .select({ parentId: watchlistItems.parentId })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, source.id));
    expect(sourceItems.map((row) => row.parentId)).toEqual([parentId]);
  });

  it("moves a parent into a custom-ordered watchlist only when a position is provided", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([
        { name: "MCP custom parent move source" },
        { name: "MCP custom parent move destination", itemOrderMode: "custom" },
      ])
      .returning();
    const parentId = "tmdb:custom-series";
    await database.getDb().insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "episode-a",
      source: "tmdb",
      mediaType: "episode",
      title: "Pilot",
      parentId,
      parentTitle: "Custom Series",
    });

    const missingPosition = await client.callTool({
      name: "move_watchlist_parents",
      arguments: {
        moves: [{ watchlistId: source.id, parentId, destinationWatchlistId: destination.id }],
      },
    });

    expect(missingPosition.isError).not.toBe(true);
    expect(missingPosition.structuredContent).toMatchObject({
      results: [{ index: 0, success: false, code: "insertion_choice_required" }],
    });
  });

  it("moves an individual item without moving the whole parent group", async () => {
    const { watchlistItems, watchlists } = await import("@/db/Schema");
    const [source, destination] = await database
      .getDb()
      .insert(watchlists)
      .values([{ name: "MCP item vs parent source" }, { name: "MCP item vs parent dest" }])
      .returning();
    const parentId = "tmdb:item-vs-parent";
    const [episode] = await database
      .getDb()
      .insert(watchlistItems)
      .values([
        {
          watchlistId: source.id,
          tmdbId: "episode-a",
          source: "tmdb",
          mediaType: "episode",
          title: "Pilot",
          parentId,
          parentTitle: "Series",
        },
        {
          watchlistId: source.id,
          tmdbId: "episode-b",
          source: "tmdb",
          mediaType: "episode",
          title: "Finale",
          parentId,
          parentTitle: "Series",
        },
      ])
      .returning();

    const result = await client.callTool({
      name: "move_watchlist_items",
      arguments: {
        moves: [{ watchlistItemId: episode.id, destinationWatchlistId: destination.id }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      results: [{ index: 0, success: true, code: "moved", affectedCount: 1 }],
    });

    const sourceItems = await database
      .getDb()
      .select({ title: watchlistItems.title })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, source.id));
    expect(sourceItems.map((row) => row.title)).toEqual(["Finale"]);
  });

  describe("anchored insert and move contract", () => {
    it("accepts referenceItemId and before/after on the four anchor-capable tools", async () => {
      const tools = await client.listTools();
      const anchorPositions = ["before", "after"];

      for (const toolName of [
        "add_media_to_watchlists",
        "add_custom_items_to_watchlists",
        "move_watchlist_items",
        "move_watchlist_parents",
      ]) {
        const tool = tools.tools.find((entry) => entry.name === toolName);
        expect(tool, `${toolName} should be registered`).toBeDefined();
        const schema = tool?.inputSchema as {
          properties?: Record<string, { enum?: string[]; type?: string }>;
        };
        const additionSchema = schema?.properties?.additions;
        const itemSchema = schema?.properties?.items;
        const moveSchema = schema?.properties?.moves;
        const additionProps =
          (additionSchema as { items?: { properties?: Record<string, unknown> } } | undefined)
            ?.items?.properties ??
          (itemSchema as { items?: { properties?: Record<string, unknown> } } | undefined)?.items
            ?.properties ??
          (moveSchema as { items?: { properties?: Record<string, unknown> } } | undefined)?.items
            ?.properties;
        expect(additionProps).toBeDefined();
        const positionProp =
          (additionProps as Record<string, { enum?: string[] }>).insertionPosition ??
          (additionProps as Record<string, { enum?: string[] }>).position;
        expect(positionProp?.enum).toEqual(expect.arrayContaining(anchorPositions));
        expect((additionProps as Record<string, { type?: string }>).referenceItemId?.type).toBe(
          "integer",
        );
      }
    });

    it("inserts a TMDB movie before an existing reference when called via MCP", async () => {
      const { watchlistItems, watchlists } = await import("@/db/Schema");
      process.env.TMDB_API_KEY = "test-tmdb-key";
      const [watchlist] = await database
        .getDb()
        .insert(watchlists)
        .values({ name: "MCP anchor add", itemOrderMode: "custom" })
        .returning();
      const [reference] = await database
        .getDb()
        .insert(watchlistItems)
        .values({
          watchlistId: watchlist.id,
          tmdbId: "anchor-existing",
          source: "tmdb",
          mediaType: "movie",
          title: "Existing Anchor",
          customRank: 1,
        })
        .returning();
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: "Inserted Before Existing",
            poster_path: null,
            release_date: "2024-04-01",
            vote_average: 7.4,
            runtime: 100,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await client.callTool({
        name: "add_media_to_watchlists",
        arguments: {
          additions: [
            {
              watchlistId: watchlist.id,
              provider: "tmdb",
              providerId: "700",
              mediaType: "movie",
              insertionPosition: "before",
              referenceItemId: reference!.id,
            },
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          { index: 0, success: true, code: "added", watchlistId: watchlist.id, affectedCount: 1 },
        ],
      });

      const items = await database
        .getDb()
        .select({ title: watchlistItems.title, customRank: watchlistItems.customRank })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlist.id))
        .orderBy(watchlistItems.customRank);
      expect(items.map((row) => row.title)).toEqual([
        "Inserted Before Existing",
        "Existing Anchor",
      ]);
      expect(items.map((row) => row.customRank)).toEqual([1, 2]);
      fetchMock.mockRestore();
    });

    it("rejects an anchored MCP add on a release-ordered list with not_custom_mode", async () => {
      const { watchlists } = await import("@/db/Schema");
      const [watchlist] = await database
        .getDb()
        .insert(watchlists)
        .values({ name: "MCP release anchor block", itemOrderMode: "release" })
        .returning();

      const result = await client.callTool({
        name: "add_media_to_watchlists",
        arguments: {
          additions: [
            {
              watchlistId: watchlist.id,
              provider: "tmdb",
              providerId: "701",
              mediaType: "movie",
              insertionPosition: "before",
              referenceItemId: 999_999,
            },
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [
          {
            index: 0,
            success: false,
            code: "not_custom_mode",
            affectedCount: 0,
          },
        ],
      });
    });

    it("rejects an anchored MCP add whose reference item is unknown with invalid_reference", async () => {
      const { watchlists } = await import("@/db/Schema");
      const [watchlist] = await database
        .getDb()
        .insert(watchlists)
        .values({ name: "MCP missing anchor reference", itemOrderMode: "custom" })
        .returning();

      const result = await client.callTool({
        name: "add_custom_items_to_watchlists",
        arguments: {
          items: [
            {
              watchlistId: watchlist.id,
              title: "Anchored pick",
              mediaType: "movie",
              year: "2025",
              insertionPosition: "before",
              referenceItemId: 424_242,
            },
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [{ index: 0, success: false, code: "invalid_reference" }],
      });
    });

    it("moves a watchlist item before an existing reference when called via MCP", async () => {
      const { watchlistItems, watchlists } = await import("@/db/Schema");
      const [source, destination] = await database
        .getDb()
        .insert(watchlists)
        .values([
          { name: "MCP anchor move source" },
          { name: "MCP anchor move dest", itemOrderMode: "custom" },
        ])
        .returning();
      const [reference] = await database
        .getDb()
        .insert(watchlistItems)
        .values([
          {
            watchlistId: destination.id,
            tmdbId: "anchor-move-existing-1",
            source: "tmdb",
            mediaType: "movie",
            title: "Anchor",
            customRank: 1,
          },
          {
            watchlistId: destination.id,
            tmdbId: "anchor-move-existing-2",
            source: "tmdb",
            mediaType: "movie",
            title: "Tail",
            customRank: 2,
          },
        ])
        .returning();
      const [movedItem] = await database
        .getDb()
        .insert(watchlistItems)
        .values({
          watchlistId: source.id,
          tmdbId: "anchor-move-item",
          source: "tmdb",
          mediaType: "movie",
          title: "Moved Before Anchor",
        })
        .returning();

      const result = await client.callTool({
        name: "move_watchlist_items",
        arguments: {
          moves: [
            {
              watchlistItemId: movedItem!.id,
              destinationWatchlistId: destination.id,
              position: "before",
              referenceItemId: reference!.id,
            },
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [{ index: 0, success: true, code: "moved", affectedCount: 1 }],
      });

      const titles = await database
        .getDb()
        .select({ title: watchlistItems.title })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, destination.id))
        .orderBy(watchlistItems.customRank);
      expect(titles.map((row) => row.title)).toEqual(["Moved Before Anchor", "Anchor", "Tail"]);
    });

    it("moves a parent group so the first sibling lands at the anchor and the rest trail", async () => {
      const { watchlistItems, watchlists } = await import("@/db/Schema");
      const [source, destination] = await database
        .getDb()
        .insert(watchlists)
        .values([
          { name: "MCP anchor parent source" },
          { name: "MCP anchor parent dest", itemOrderMode: "custom" },
        ])
        .returning();
      const [reference] = await database
        .getDb()
        .insert(watchlistItems)
        .values([
          {
            watchlistId: destination.id,
            tmdbId: "anchor-parent-dest-1",
            source: "tmdb",
            mediaType: "movie",
            title: "Head",
            customRank: 1,
          },
          {
            watchlistId: destination.id,
            tmdbId: "anchor-parent-dest-2",
            source: "tmdb",
            mediaType: "movie",
            title: "Tail",
            customRank: 2,
          },
        ])
        .returning();
      const parentId = "tmdb:anchor-parent-source";
      await database
        .getDb()
        .insert(watchlistItems)
        .values([
          {
            watchlistId: source.id,
            tmdbId: "anchor-parent-source-1",
            source: "tmdb",
            mediaType: "episode",
            title: "Parent",
            parentId,
            parentTitle: "Series",
          },
          {
            watchlistId: source.id,
            tmdbId: "anchor-parent-source-2",
            source: "tmdb",
            mediaType: "episode",
            title: "Pilot",
            parentId,
            parentTitle: "Series",
          },
        ]);

      const result = await client.callTool({
        name: "move_watchlist_parents",
        arguments: {
          moves: [
            {
              watchlistId: source.id,
              parentId,
              destinationWatchlistId: destination.id,
              position: "after",
              referenceItemId: reference!.id,
            },
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [{ index: 0, success: true, code: "moved", affectedCount: 2 }],
      });

      const titles = await database
        .getDb()
        .select({ title: watchlistItems.title })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, destination.id))
        .orderBy(watchlistItems.customRank);
      expect(titles.map((row) => row.title)).toEqual(["Head", "Parent", "Pilot", "Tail"]);
    });
  });
});
