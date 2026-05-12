import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceFile = (relativePath: string) => path.resolve(process.cwd(), relativePath);

describe("route module boundaries", () => {
  it("keeps shared route modules from importing server-only modules directly", () => {
    const indexRoute = readFileSync(workspaceFile("src/routes/index.tsx"), "utf8");
    const watchlistDetailRoute = readFileSync(
      workspaceFile("src/routes/watchlists/$watchlistId.tsx"),
      "utf8",
    );

    expect(indexRoute).not.toMatch(/from\s+["'][^"']+\.server["']/);
    expect(watchlistDetailRoute).not.toMatch(/from\s+["'][^"']+\.server["']/);
  });

  it("loads the watchlist list screen through the feature-owned read surface", () => {
    const indexRoute = readFileSync(workspaceFile("src/routes/index.tsx"), "utf8");

    expect(indexRoute).toMatch(/from\s+["']@\/features\/watchlists\/list\/query["']/);
    expect(indexRoute).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
  });

  it("loads the watchlist detail screen through the feature-owned query surface", () => {
    const watchlistDetailRoute = readFileSync(
      workspaceFile("src/routes/watchlists/$watchlistId.tsx"),
      "utf8",
    );

    expect(watchlistDetailRoute).toMatch(/from\s+["']@\/features\/watchlists\/detail\/query["']/);
    expect(watchlistDetailRoute).toMatch(/from\s+["']@\/features\/watchlists\/detail\/screen["']/);
    expect(watchlistDetailRoute).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
    expect(watchlistDetailRoute).not.toMatch(
      /from\s+["']@\/components\/watchlist\/WatchlistDetail["']/,
    );
  });

  it("keeps search-to-watchlist integration inside the search feature boundary", () => {
    const searchRoute = readFileSync(workspaceFile("src/routes/search.tsx"), "utf8");
    const searchResults = readFileSync(
      workspaceFile("src/features/search/SearchResults.tsx"),
      "utf8",
    );
    const searchMediaDetailSheet = readFileSync(
      workspaceFile("src/features/search/SearchMediaDetailSheet.tsx"),
      "utf8",
    );

    expect(searchRoute).toMatch(/from\s+["']@\/features\/search\/SearchResults["']/);
    expect(searchRoute).not.toMatch(/from\s+["']\.\.\/components\/SearchResults["']/);

    expect(searchResults).toMatch(/from\s+["']\.\/SearchMediaDetailSheet["']/);
    expect(searchMediaDetailSheet).toMatch(/from\s+["']@\/features\/watchlists\/add\/mutation["']/);
    expect(searchMediaDetailSheet).toMatch(/from\s+["']@\/features\/watchlists\/list\/query["']/);
    expect(searchMediaDetailSheet).toMatch(/useServerFn\(getWatchlistList\)/);
    expect(searchMediaDetailSheet).toMatch(/useServerFn\(addToWatchlist\)/);
    expect(searchMediaDetailSheet).toMatch(/watchlistListQueryKey\(/);
    expect(searchMediaDetailSheet).not.toMatch(/from\s+["']@\/server\/watchlist["']/);
  });

  it("keeps search-owned integration files free of server and client directives", () => {
    const files = [
      "src/routes/search.tsx",
      "src/server/search.ts",
      "src/features/search/SearchResults.tsx",
      "src/features/search/SearchMediaDetailSheet.tsx",
      "src/features/search/CreateCustomItemDialog.tsx",
    ];

    for (const file of files) {
      const contents = readFileSync(workspaceFile(file), "utf8");

      expect(contents).not.toMatch(/["']use server["']/);
      expect(contents).not.toMatch(/["']use client["']/);
    }
  });

  it("executes the merge watchlists flow through the feature-owned mutation surface", () => {
    const mergeDialog = readFileSync(
      workspaceFile("src/components/MergeWatchlistDialog.tsx"),
      "utf8",
    );

    expect(mergeDialog).toMatch(/from\s+["']@\/features\/watchlists\/merge\/mutation["']/);
    expect(mergeDialog).toMatch(/useServerFn\(mergeWatchlists\)/);
    expect(mergeDialog).toMatch(/mergeWatchlistsFn\(/);
    expect(mergeDialog).not.toMatch(/await\s+mergeWatchlists\(/);
    expect(mergeDialog).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
  });

  it("uses TanStack server functions and feature query keys in touched components", () => {
    const mediaDetailSheet = readFileSync(
      workspaceFile("src/features/search/SearchMediaDetailSheet.tsx"),
      "utf8",
    );
    const timelineItem = readFileSync(
      workspaceFile("src/features/watchlists/components/timeline-item.tsx"),
      "utf8",
    );
    const toggleWatchedHook = readFileSync(
      workspaceFile("src/features/watchlists/detail/use-toggle-watched-item.ts"),
      "utf8",
    );
    const watchlistDetail = readFileSync(
      workspaceFile("src/features/watchlists/detail/screen.tsx"),
      "utf8",
    );
    const itemOrderModeHook = readFileSync(
      workspaceFile("src/features/watchlists/detail/use-item-order-mode-mutation.ts"),
      "utf8",
    );

    expect(mediaDetailSheet).not.toMatch(/["']use client["']/);
    expect(mediaDetailSheet).toMatch(/useServerFn\(getWatchlistList\)/);
    expect(mediaDetailSheet).toMatch(/useServerFn\(addToWatchlist\)/);
    expect(mediaDetailSheet).toMatch(/watchlistListQueryKey\(/);

    expect(timelineItem).not.toMatch(/["']use client["']/);
    expect(timelineItem).toMatch(
      /from\s+["']@\/features\/watchlists\/detail\/use-toggle-watched-item["']/,
    );
    expect(toggleWatchedHook).toMatch(/from\s+["']@\/features\/watchlists\/toggle\/mutation["']/);
    expect(toggleWatchedHook).toMatch(/useServerFn\(toggleWatched\)/);
    expect(toggleWatchedHook).toMatch(/toggleWatchedFn\(/);
    expect(toggleWatchedHook).toMatch(/optimisticallyToggleWatchedItem\(/);
    expect(toggleWatchedHook).toMatch(/rollbackWatchedToggle\(/);
    expect(toggleWatchedHook).toMatch(/invalidateWatchlistQueries\(/);
    expect(toggleWatchedHook).not.toMatch(/await\s+toggleWatched\(/);
    expect(toggleWatchedHook).not.toMatch(/from\s+["']@\/server\/watchlist["']/);

    expect(watchlistDetail).not.toMatch(/["']use client["']/);
    expect(watchlistDetail).toMatch(
      /from\s+["']@\/features\/watchlists\/detail\/use-item-order-mode-mutation["']/,
    );
    expect(itemOrderModeHook).toMatch(
      /from\s+["']@\/features\/watchlists\/order-mode\/mutation["']/,
    );
    expect(itemOrderModeHook).toMatch(/useServerFn\(updateWatchlistItemOrderMode\)/);
    expect(itemOrderModeHook).toMatch(/optimisticallyUpdateWatchlistItemOrderMode\(/);
    expect(itemOrderModeHook).toMatch(/rollbackWatchlistItemOrderMode\(/);
    expect(itemOrderModeHook).toMatch(/invalidateWatchlistQueries\(/);
    expect(itemOrderModeHook).not.toMatch(/await\s+updateWatchlistItemOrderMode\(/);
  });

  it("keeps server-only imports inside TanStack server function surfaces", () => {
    const watchlistQueries = readFileSync(
      workspaceFile("src/features/watchlists/detail/query.ts"),
      "utf8",
    );

    expect(watchlistQueries).not.toMatch(/from\s+["']\.\.\/read\.server["']/);
    expect(watchlistQueries).toMatch(/from\s+["']\.\/query\.server["']/);
    expect(watchlistQueries).toMatch(/createServerFn\(\)/);
  });

  it("keeps touched watchlist UI inside the watchlists feature boundary", () => {
    const watchlistDetailScreen = readFileSync(
      workspaceFile("src/features/watchlists/detail/screen.tsx"),
      "utf8",
    );
    const watchlistHeader = readFileSync(
      workspaceFile("src/features/watchlists/components/watchlist-header.tsx"),
      "utf8",
    );

    expect(watchlistDetailScreen).toMatch(
      /from\s+["']@\/features\/watchlists\/components\/watchlist-header["']/,
    );
    expect(watchlistDetailScreen).toMatch(
      /from\s+["']@\/features\/watchlists\/components\/watchlist-timeline["']/,
    );
    expect(watchlistHeader).not.toMatch(/from\s+["']@\/components\/watchlist\/WatchlistHeader["']/);
  });
});
