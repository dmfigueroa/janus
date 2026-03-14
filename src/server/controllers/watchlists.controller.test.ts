import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const notFoundResponse = { isNotFound: true };

class WatchlistNotFoundError extends Error {
  constructor(readonly watchlistId: number) {
    super(`Watchlist ${watchlistId} not found`);
  }
}

const getWatchlistByIdInternal = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  notFound: () => notFoundResponse,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;

    return {
      inputValidator(validator: (data: unknown) => unknown) {
        validate = validator;
        return this;
      },
      handler(handler: ({ data }: { data: unknown }) => unknown) {
        return async ({ data }: { data: unknown }) => handler({ data: validate(data) });
      },
    };
  },
}));

vi.mock("../models/watchlist", () => ({
  createWatchlistRecord: vi.fn(),
  deleteWatchlistRecord: vi.fn(),
  deleteWatchlistSchema: z.object({ id: z.number() }),
  getDeprecatedWatchlistAddRejection: vi.fn(() => null),
  getWatchlistByIdInputSchema: z.object({
    id: z.number(),
    page: z.number().optional().default(1),
    limit: z.number().optional().default(20),
    query: z.string().optional(),
    isWatched: z.boolean().optional(),
  }),
  getWatchlistByIdInternal,
  getWatchlistsInputSchema: z.object({}).passthrough(),
  listWatchlists: vi.fn(),
  mergeWatchlistRecords: vi.fn(),
  mergeWatchlistSchema: z.object({}).passthrough(),
  setWatchlistItemWatchedState: vi.fn(),
  WatchlistNotFoundError,
  watchlistSchema: z.object({}).passthrough(),
}));

vi.mock("../models/watchlist/import", () => ({
  createImportSchema: z.object({}).passthrough(),
  getImportByJobId: vi.fn(),
}));

vi.mock("../jobs/watchlist/import.job", () => ({
  enqueueImport: vi.fn(),
  logWatchlistImportEnqueueError: vi.fn(),
}));

describe("watchlists controller", () => {
  beforeEach(() => {
    getWatchlistByIdInternal.mockReset();
  });

  it("returns watchlist details when the model resolves", async () => {
    getWatchlistByIdInternal.mockResolvedValue({
      watchlist: { id: 1, name: "Controller Test" },
      items: [],
      nextCursor: undefined,
    });

    const { getWatchlistById } = await import("./watchlists.controller");
    const result = await getWatchlistById({ data: { id: 1, page: 1, limit: 20 } });

    expect(getWatchlistByIdInternal).toHaveBeenCalledWith({ id: 1, page: 1, limit: 20 });
    expect(result).toEqual({
      watchlist: { id: 1, name: "Controller Test" },
      items: [],
      nextCursor: undefined,
    });
  });

  it("translates WatchlistNotFoundError into notFound", async () => {
    getWatchlistByIdInternal.mockRejectedValue(new WatchlistNotFoundError(999_999));

    const { getWatchlistById } = await import("./watchlists.controller");

    await expect(getWatchlistById({ data: { id: 999_999, page: 1, limit: 20 } })).rejects.toBe(
      notFoundResponse,
    );
  });
});
