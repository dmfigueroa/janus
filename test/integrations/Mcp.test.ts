import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
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
      results: [{ success: true, code: "no_new_episodes", affectedCount: 0 }],
    });
    fetchMock.mockRestore();
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
});
