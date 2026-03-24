import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceFile = (relativePath: string) => path.resolve(process.cwd(), relativePath);

describe("route module boundaries", () => {
  it("keeps shared route modules from importing server-only watchlists entrypoints", () => {
    const indexRoute = readFileSync(workspaceFile("src/routes/index.tsx"), "utf8");
    const watchlistDetailRoute = readFileSync(
      workspaceFile("src/routes/watchlists/$watchlistId.tsx"),
      "utf8",
    );

    expect(indexRoute).not.toContain("@/features/watchlists/index.server");
    expect(watchlistDetailRoute).not.toContain("@/features/watchlists/index.server");
  });
});
