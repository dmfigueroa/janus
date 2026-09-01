import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
      arguments: { watchlistId: watchlist.id, pageSize: 1 },
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
});
