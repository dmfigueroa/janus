// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/schema";
import { WatchlistTimeline } from "@/features/watchlists/components/watchlist-timeline";

let latestDndContextProps: Record<string, ((event: any) => void) | undefined> = {};

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: { children: React.ReactNode }) => {
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
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
    disabled,
  })),
}));

vi.mock("./timeline-item", () => ({
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
    parentTitle: null,
    season: null,
    episode: null,
    posterPath: null,
    releaseDate: overrides.releaseDate ?? "2024-01-01",
    voteAverage: null,
    runtime: null,
    customRank: overrides.customRank ?? null,
    isWatched: false,
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
  });

  it("renders a flat custom-mode list with reorder handles", () => {
    render(
      <WatchlistTimeline
        items={[
          item({ id: 1, title: "First", releaseDate: "2024-01-01" }),
          item({ id: 2, title: "Second", releaseDate: "2025-01-01" }),
        ]}
        itemOrderMode="custom"
        canReorder
        onReorder={vi.fn()}
      />,
    );

    expect(screen.queryByText("2024")).toBeNull();
    expect(screen.queryByText("2025")).toBeNull();
    expect(screen.getByRole("button", { name: "Move First" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Move Second" })).toHaveProperty("disabled", false);
  });

  it("hides reorder handles in custom mode when reordering is unavailable", () => {
    render(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" }), item({ id: 2, title: "Second" })]}
        itemOrderMode="custom"
        canReorder={false}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Move First" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Second" })).toBeNull();
  });

  it("keeps year groupings and removes reorder affordances in release mode", () => {
    render(
      <WatchlistTimeline
        items={[
          item({ id: 1, title: "First", releaseDate: "2024-01-01" }),
          item({ id: 2, title: "Second", releaseDate: "2025-01-01" }),
        ]}
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

    const { rerender } = render(
      <WatchlistTimeline
        items={[item({ id: 1, title: "First" }), item({ id: 2, title: "Second" })]}
        itemOrderMode="custom"
        canReorder
        onReorder={onReorder}
      />,
    );

    act(() => {
      latestDndContextProps.onDragStart?.({
        active: { id: 1 },
      });
    });

    act(() => {
      latestDndContextProps.onDragEnd?.({
        active: { id: 1 },
        over: {
          id: 2,
        },
      });
    });

    expect(onReorder).toHaveBeenCalledWith({
      movedItemId: 1,
      position: "after",
      referenceItemId: 2,
    });

    rerender(
      <WatchlistTimeline
        items={[item({ id: 2, title: "Second" }), item({ id: 1, title: "First" })]}
        itemOrderMode="custom"
        canReorder
        onReorder={onReorder}
      />,
    );
  });
});
