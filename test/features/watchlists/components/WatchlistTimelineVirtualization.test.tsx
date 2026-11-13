// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import { janusSystem } from "@/app/Theme";

vi.mock("@/features/watchlists/components/TimelineItem", () => ({
  TimelineItem: ({ item }: { item: WatchlistItem }) => <div>{item.title}</div>,
}));

function item(id: number): WatchlistItem {
  return {
    id,
    watchlistId: 1,
    tmdbId: String(id),
    source: "tmdb",
    mediaType: "movie",
    title: `Item ${id}`,
    parentId: null,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: "2024-03-01",
    voteAverage: null,
    runtime: null,
    customRank: null,
    isWatched: false,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}

const ROW_HEIGHT = 136;

function mountedRowCount() {
  return screen.queryAllByTestId(/watchlist-timeline-row-/).length;
}

beforeEach(() => {
  globalThis.IntersectionObserver = vi.fn(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
    takeRecords: () => [],
    root: null,
    rootMargin: "",
    thresholds: [],
  })) as unknown as typeof IntersectionObserver;
  // jsdom has no layout: report a plausible row height so the virtualizer can window
  // a 300-row list instead of treating every row as zero-height.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute("data-index") ? ROW_HEIGHT : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

describe("watchlist timeline virtualization", () => {
  it("mounts only the visible window of a long release timeline", () => {
    render(
      <ChakraProvider value={janusSystem}>
        <WatchlistTimeline
          items={Array.from({ length: 300 }, (_, index) => item(index + 1))}
          unwatchedOnly={false}
          itemOrderMode="release"
        />
      </ChakraProvider>,
    );

    expect(mountedRowCount()).toBeGreaterThan(0);
    expect(mountedRowCount()).toBeLessThan(40);
    expect(screen.queryByTestId("watchlist-timeline-row-1")).not.toBeNull();
    expect(screen.queryByTestId("watchlist-timeline-row-300")).toBeNull();
    expect(screen.getByText("2024")).not.toBeNull();
  });

  it("keeps a short timeline fully mounted", () => {
    render(
      <ChakraProvider value={janusSystem}>
        <WatchlistTimeline
          items={[item(1), item(2), item(3)]}
          unwatchedOnly={false}
          itemOrderMode="release"
        />
      </ChakraProvider>,
    );

    expect(mountedRowCount()).toBe(3);
  });
});
