// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import { janusSystem } from "@/app/Theme";
vi.mock("@/features/watchlists/components/TimelineItem", () => ({
  TimelineItem: ({ item }: { item: WatchlistItem }) => <div>{item.title}</div>,
}));
function item(
  overrides: Partial<WatchlistItem> & Pick<WatchlistItem, "id" | "title">,
): WatchlistItem {
  return {
    id: overrides.id,
    watchlistId: 1,
    tmdbId: overrides.tmdbId ?? String(overrides.id),
    source: "tmdb",
    mediaType: "movie",
    title: overrides.title,
    parentId: null,
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: overrides.releaseDate ?? "2024-01-01",
    voteAverage: null,
    runtime: null,
    customRank: overrides.customRank ?? null,
    isWatched: false,
    authors: null,
    addedAt: "2024-01-01 00:00:00",
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});
it.each(["mouse", "touch"])(
  "does not animate the released overlay back to the pre-save row: %s",
  async (sensor) => {
    globalThis.IntersectionObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      takeRecords: () => [],
      root: null,
      rootMargin: "",
      thresholds: [],
    })) as unknown as typeof IntersectionObserver;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const row = this.closest("[data-testid^='watchlist-timeline-row-']");
        const rows = Array.from(
          document.querySelectorAll("[data-testid^='watchlist-timeline-row-']"),
        );
        const top = row ? 100 + rows.indexOf(row) * 100 : 100;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          bottom: top + 90,
          right: 300,
          width: 300,
          height: 90,
          toJSON: () => ({}),
        };
      },
    );
    const computedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = computedStyle(element, pseudo);
      if (element instanceof HTMLElement && element.style.position === "fixed") {
        return new Proxy(style, {
          get(target, property) {
            return property === "transform"
              ? "matrix(1, 0, 0, 1, 0, -200)"
              : Reflect.get(target, property);
          },
        });
      }
      return style;
    });
    const animate = vi.fn(() => ({ onfinish: null, cancel: vi.fn() }));
    // jsdom has no layout or Web Animations; keep a started animation pending.
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    let finishPreparation = (_ready: boolean) => {};
    const preparation = new Promise<boolean>((resolve) => {
      finishPreparation = resolve;
    });
    const onReorder = vi.fn(() => preparation);
    const { rerender } = render(
      <ChakraProvider value={janusSystem}>
        <WatchlistTimeline
          items={[
            item({ id: 1, title: "First" }),
            item({ id: 2, title: "Second" }),
            item({ id: 3, title: "Third" }),
          ]}
          activeFilters={{ watchlistId: 1, itemOrderMode: "custom" }}
          itemOrderMode="custom"
          canReorder
          onReorder={onReorder}
        />
      </ChakraProvider>,
    );
    const handle = screen.getByRole("button", { name: "Move Third" });
    const touch = { identifier: 1, target: handle, clientX: 16, clientY: 340 };
    if (sensor === "mouse") {
      fireEvent.mouseDown(handle, { button: 0, clientX: 16, clientY: 340 });
    } else {
      fireEvent.touchStart(handle, { touches: [touch], changedTouches: [touch] });
    }
    await waitFor(() => expect(screen.getAllByText("Third")).toHaveLength(2));
    if (sensor === "mouse") {
      fireEvent.mouseMove(document, { clientX: 16, clientY: 140 });
      fireEvent.mouseUp(document, { clientX: 16, clientY: 140 });
    } else {
      const movedTouch = { ...touch, clientY: 140 };
      fireEvent.touchMove(handle, { touches: [movedTouch], changedTouches: [movedTouch] });
      fireEvent.touchEnd(handle, { touches: [], changedTouches: [movedTouch] });
    }
    await waitFor(() => expect(onReorder).toHaveBeenCalledOnce());
    // The floating row must survive release until the optimistic cache is ready.
    expect(screen.getAllByText("Third")).toHaveLength(2);
    rerender(
      <ChakraProvider value={janusSystem}>
        <WatchlistTimeline
          items={[
            item({ id: 3, title: "Third" }),
            item({ id: 1, title: "First" }),
            item({ id: 2, title: "Second" }),
          ]}
          activeFilters={{ watchlistId: 1, itemOrderMode: "custom" }}
          itemOrderMode="custom"
          canReorder={false}
          interactionDisabled
          onReorder={onReorder}
        />
      </ChakraProvider>,
    );
    // Cache notifications must not change the sortable input during the active
    // drag: otherwise the library displaces the newly ordered neighbors again.
    expect(screen.getAllByTestId(/watchlist-timeline-row-/).map((row) => row.textContent)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    finishPreparation(true);
    await waitFor(() => expect(screen.getAllByText("Third")).toHaveLength(1));
    expect(screen.getAllByTestId(/watchlist-timeline-row-/).map((row) => row.textContent)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
    const droppedRow = screen.getByTestId("watchlist-timeline-row-3");
    expect(droppedRow.style.transform).toBe("");
    expect(droppedRow.style.transition).toBe("");
    expect(animate).not.toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith({
      movedItemId: 3,
      referenceItemId: 1,
      position: "before",
    });
  },
);
