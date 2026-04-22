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

    expect(indexRoute).toMatch(/from\s+["']@\/features\/watchlists\/queries["']/);
    expect(indexRoute).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
  });

  it("loads the watchlist detail screen through the feature-owned query surface", () => {
    const watchlistDetailRoute = readFileSync(
      workspaceFile("src/routes/watchlists/$watchlistId.tsx"),
      "utf8",
    );

    expect(watchlistDetailRoute).toMatch(/from\s+["']@\/features\/watchlists\/detail\/query["']/);
    expect(watchlistDetailRoute).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
  });

  it("executes the merge watchlists flow through the feature-owned mutation surface", () => {
    const mergeDialog = readFileSync(
      workspaceFile("src/components/MergeWatchlistDialog.tsx"),
      "utf8",
    );

    expect(mergeDialog).toMatch(/from\s+["']@\/features\/watchlists\/mutations["']/);
    expect(mergeDialog).not.toMatch(/from\s+["']@\/controllers\/watchlists["']/);
  });

  it("keeps the shared watchlist query surface free of server-only imports", () => {
    const watchlistQueries = readFileSync(
      workspaceFile("src/features/watchlists/detail/query.ts"),
      "utf8",
    );

    expect(watchlistQueries).not.toMatch(/from\s+["'][^"']+\.server["']/);
    expect(watchlistQueries).not.toMatch(/from\s+["']\.\.\/read\.server["']/);
  });
});
