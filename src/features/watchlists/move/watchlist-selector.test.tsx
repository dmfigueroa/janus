// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";
import { WatchlistSelector } from "./watchlist-selector";

function createWatchlistSummary(
  overrides: Partial<WatchlistSummary> & Pick<WatchlistSummary, "id" | "name">,
): WatchlistSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? null,
    itemOrderMode: overrides.itemOrderMode ?? "release",
    createdAt: overrides.createdAt ?? "2024-01-01 00:00:00",
    updatedAt: overrides.updatedAt ?? null,
    lastWatchedAt: overrides.lastWatchedAt ?? null,
    lastItemAddedAt: overrides.lastItemAddedAt ?? null,
    stats: overrides.stats ?? {
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
}

describe("WatchlistSelector", () => {
  afterEach(() => {
    cleanup();
  });

  const watchlists: WatchlistSummary[] = [
    createWatchlistSummary({ id: 1, name: "Movie Night" }),
    createWatchlistSummary({ id: 2, name: "TV Shows" }),
    createWatchlistSummary({ id: 3, name: "Anime Collection" }),
  ];

  it("renders all watchlists when no search query is entered", () => {
    render(
      <WatchlistSelector
        watchlists={watchlists}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Movie Night")).not.toBeNull();
    expect(screen.getByText("TV Shows")).not.toBeNull();
    expect(screen.getByText("Anime Collection")).not.toBeNull();
  });

  it("filters watchlists by name when a search query is typed", () => {
    render(
      <WatchlistSelector
        watchlists={watchlists}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search watchlists...");
    fireEvent.change(searchInput, { target: { value: "movie" } });

    expect(screen.getByText("Movie Night")).not.toBeNull();
    expect(screen.queryByText("TV Shows")).toBeNull();
    expect(screen.queryByText("Anime Collection")).toBeNull();
  });

  it("shows a message when the search query matches no watchlists", () => {
    render(
      <WatchlistSelector
        watchlists={watchlists}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search watchlists...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText("No matching watchlists")).not.toBeNull();
    expect(screen.queryByText("Movie Night")).toBeNull();
  });

  it("restores the full list when the search query is cleared", () => {
    render(
      <WatchlistSelector
        watchlists={watchlists}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search watchlists...");
    fireEvent.change(searchInput, { target: { value: "tv" } });
    expect(screen.getByText("TV Shows")).not.toBeNull();
    expect(screen.queryByText("Movie Night")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Movie Night")).not.toBeNull();
    expect(screen.getByText("TV Shows")).not.toBeNull();
    expect(screen.getByText("Anime Collection")).not.toBeNull();
  });

  it("preserves the selected watchlist even when hidden by search", () => {
    const onSelect = vi.fn();
    render(
      <WatchlistSelector
        watchlists={watchlists}
        selectedId={2}
        isLoading={false}
        isError={false}
        onSelect={onSelect}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search watchlists...");
    fireEvent.change(searchInput, { target: { value: "anime" } });

    expect(screen.queryByText("TV Shows")).toBeNull();
    expect(screen.getByText("Anime Collection")).not.toBeNull();
  });
});
