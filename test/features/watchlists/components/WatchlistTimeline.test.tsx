// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { DndContextProps, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import { WatchlistTimeline } from "@/features/watchlists/components/WatchlistTimeline";
import { janusSystem } from "@/app/Theme";

const activeFilters = {
  watchlistId: 1,
  itemOrderMode: "custom" as const,
  unwatchedOnly: false,
  query: "",
};

let latestDndContextProps: Pick<DndContextProps, "onDragStart" | "onDragEnd"> = {};
let sortableListeners: Record<string, () => void> = {};

function activeDrag(id: number) {
  return {
    id,
    data: { current: undefined },
    rect: { current: { initial: null, translated: null } },
  };
}

function dragStart(id: number) {
  return {
    active: activeDrag(id),
    activatorEvent: new Event("dragstart"),
  } satisfies DragStartEvent;
}

function dragEnd(activeId: number, overId: number) {
  return {
    active: activeDrag(activeId),
    activatorEvent: new Event("dragend"),
    collisions: null,
    delta: { x: 0, y: 0 },
    over: {
      id: overId,
      rect: { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 },
      disabled: false,
      data: { current: undefined },
    },
  } satisfies DragEndEvent;
}

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: DndContextProps) => {
    latestDndContextProps = props;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
  closestCenter: vi.fn(),
  useSensor: vi.fn((sensor, options) => ({ sensor, options })),
  useSensors: vi.fn((...sensors) => sensors),
}));

vi.mock("@dnd-kit/modifiers", () => ({
  restrictToVerticalAxis: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: vi.fn(({ id, disabled }: { id: number; disabled: boolean }) => ({
    attributes: { "data-sortable-id": id },
    listeners: sortableListeners,
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
    disabled,
  })),
}));

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

describe("WatchlistTimeline reorder controls", () => {
  beforeEach(() => {
    globalThis.IntersectionObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      takeRecords: vi.fn(() => []),
      root: null,
      rootMargin: "",
      thresholds: [],
    })) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    cleanup();
    latestDndContextProps = {};
    sortableListeners = {};
  });

  it("renders a flat custom-mode list with reorder handles", () => {
    renderWithProvider(
      <WatchlistTimeline
        items={[
          item({ id: 1, title: "First", releaseDate: "2024-01-01" }),
          item({ id: 2, title: "Second", releaseDate: "2025-01-01" }),
        ]}
        activeFilters={activeFilters}
        itemOrderMode="custom"
        canReorder
        onReorder={vi.fn()}
      />,
    );

    expect(screen.queryByText("2024")).toBeNull();
    expect(screen.queryByText("2025")).toBeNull();
    const firstHandle = screen.getByRole("button", { name: "Move First" });
    expect(firstHandle).toHaveProperty("disabled", false);
    expect(getComputedStyle(firstHandle).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(screen.getByRole("button", { name: "Move Second" })).toHaveProperty("disabled", false);
  });

  it("activates dragging without allowing native selection gestures", () => {
    const onMouseDown = vi.fn();
    sortableListeners = { onMouseDown };

    renderWithProvider(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" })]}
        activeFilters={activeFilters}
        itemOrderMode="custom"
        canReorder
        onReorder={vi.fn()}
      />,
    );

    const handle = screen.getByRole("button", { name: "Move First" });
    fireEvent.mouseDown(handle);

    expect(onMouseDown).toHaveBeenCalledOnce();
    expect(handle.getAttribute("style")).toContain("user-select: none");
    expect(handle.style.touchAction).toBe("none");
  });

  it("hides reorder handles in custom mode when reordering is unavailable", () => {
    renderWithProvider(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" }), item({ id: 2, title: "Second" })]}
        activeFilters={activeFilters}
        itemOrderMode="custom"
        canReorder={false}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Move First" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Second" })).toBeNull();
  });

  it("keeps year groupings and removes reorder affordances in release mode", () => {
    renderWithProvider(
      <WatchlistTimeline
        items={[
          item({ id: 1, title: "First", releaseDate: "2024-01-01" }),
          item({ id: 2, title: "Second", releaseDate: "2025-01-01" }),
        ]}
        activeFilters={{ ...activeFilters, itemOrderMode: "release" }}
        itemOrderMode="release"
        canReorder
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText("2024")).not.toBeNull();
    expect(screen.getByText("2025")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Move First" })).toBeNull();
  });

  it("keeps the dropped order locally until the reordered items arrive", () => {
    const onReorder = vi.fn();

    const { rerender: rerenderBase } = renderWithProvider(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" }), item({ id: 2, title: "Second" })]}
        activeFilters={activeFilters}
        itemOrderMode="custom"
        canReorder
        onReorder={onReorder}
      />,
    );

    act(() => {
      latestDndContextProps.onDragStart?.(dragStart(1));
    });

    act(() => {
      latestDndContextProps.onDragEnd?.(dragEnd(1, 2));
    });

    expect(onReorder).toHaveBeenCalledWith({
      movedItemId: 1,
      position: "after",
      referenceItemId: 2,
    });

    const rowLabels = screen
      .getAllByTestId(/watchlist-timeline-row-/)
      .map((row) => row.textContent?.trim());
    expect(rowLabels).toEqual(["Second", "First"]);

    rerenderBase(
      <ChakraProvider value={janusSystem}>
        <WatchlistTimeline
          items={[item({ id: 2, title: "Second" }), item({ id: 1, title: "First" })]}
          activeFilters={activeFilters}
          itemOrderMode="custom"
          canReorder
          onReorder={onReorder}
        />
        ,
      </ChakraProvider>,
    );
  });
});

function renderWithProvider(ui: React.ReactElement) {
  return render(<ChakraProvider value={janusSystem}>{ui}</ChakraProvider>);
}
