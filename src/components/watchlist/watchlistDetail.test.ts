import { describe, it, expect } from "vitest";
import { buildWatchlistQueryInput } from "./WatchlistDetail";

describe("buildWatchlistQueryInput", () => {
  it("includes query and unwatched filter when provided", () => {
    const result = buildWatchlistQueryInput({
      watchlistId: 42,
      page: 2,
      query: "saga",
      showUnwatchedOnly: true,
    });

    expect(result).toEqual({
      data: {
        id: 42,
        page: 2,
        limit: 50,
        query: "saga",
        isWatched: false,
      },
    });
  });

  it("omits query and unwatched filter when not needed", () => {
    const result = buildWatchlistQueryInput({
      watchlistId: 7,
      page: 1,
      query: "",
      showUnwatchedOnly: false,
    });

    expect(result).toEqual({
      data: {
        id: 7,
        page: 1,
        limit: 50,
        query: undefined,
        isWatched: undefined,
      },
    });
  });
});
