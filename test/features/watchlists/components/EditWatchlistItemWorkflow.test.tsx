// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/db/Schema";
import { TimelineItem } from "@/features/watchlists/components/TimelineItem";
import { Provider } from "@/app/Provider";

const { editWatchlistItemFn, editWatchlistItemServerFn } = vi.hoisted(() => ({
  editWatchlistItemFn: vi.fn(),
  editWatchlistItemServerFn: Symbol("editWatchlistItem"),
}));

vi.mock("@/features/watchlists/edit/Mutation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/watchlists/edit/Mutation")>();

  return {
    ...actual,
    editWatchlistItem: editWatchlistItemServerFn,
  };
});

vi.mock("@tanstack/react-start", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-start")>("@tanstack/react-start");

  return {
    ...actual,
    useServerFn: (serverFn: unknown) =>
      serverFn === editWatchlistItemServerFn ? editWatchlistItemFn : vi.fn(),
  };
});

const item: WatchlistItem = {
  id: 1,
  watchlistId: 1,
  tmdbId: "movie-1",
  source: "tmdb",
  mediaType: "movie",
  title: "Movie",
  parentId: null,
  parentTitle: null,
  season: null,
  episode: null,
  posterPath: "/current-poster.jpg",
  releaseDate: "2024-01-01",
  voteAverage: null,
  runtime: null,
  customRank: 7,
  isWatched: false,
  authors: null,
  addedAt: "2024-01-01 00:00:00",
};

describe("watchlist item poster image editing", () => {
  beforeEach(() => {
    editWatchlistItemFn.mockReset();
    globalThis.ResizeObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    })) as unknown as typeof ResizeObserver;
  });

  afterEach(cleanup);

  it("shows the current poster image value and preview in the Edit dialog", async () => {
    renderTimelineItem();

    await openEditDialog();

    expect(screen.getByLabelText("Poster image")).toHaveProperty("value", "/current-poster.jpg");
    expect(screen.getByRole("img", { name: "Poster preview for Movie" }).getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w500/current-poster.jpg",
    );
  });

  it("previews a provider poster image path before saving", async () => {
    renderTimelineItem();

    await openEditDialog();
    fireEvent.change(screen.getByLabelText("Poster image"), {
      target: { value: "/replacement-poster.jpg" },
    });

    expect(screen.getByRole("img", { name: "Poster preview for Movie" }).getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w500/replacement-poster.jpg",
    );
    expect(editWatchlistItemFn).not.toHaveBeenCalled();
  });

  it("rejects an unsafe poster image value without closing the Edit dialog", async () => {
    renderTimelineItem();

    await openEditDialog();
    fireEvent.change(screen.getByLabelText("Poster image"), {
      target: { value: "http://images.example.com/poster.jpg" },
    });

    expect(screen.queryByRole("img", { name: "Poster preview for Movie" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(editWatchlistItemFn).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit watchlist item" })).not.toBeNull();
    expect(screen.getByLabelText("Poster image")).toHaveProperty(
      "value",
      "http://images.example.com/poster.jpg",
    );
    expect(
      screen.getByText("Poster image must be an HTTPS URL or a provider path beginning with /."),
    ).not.toBeNull();
  });

  it("saves a full HTTPS poster URL and closes the Edit dialog after invalidating queries", async () => {
    editWatchlistItemFn.mockResolvedValue({ success: true });
    const queryClient = renderTimelineItem();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await openEditDialog();
    fireEvent.change(screen.getByLabelText("Poster image"), {
      target: { value: "https://images.example.com/replacement.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(editWatchlistItemFn).toHaveBeenCalledWith({
        data: {
          watchlistId: 1,
          itemId: 1,
          title: "Movie",
          releaseDate: "2024-01-01",
          posterPath: "https://images.example.com/replacement.jpg",
        },
      });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["watchlists"] });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit watchlist item" })).toBeNull();
    });
  });

  it("clears the poster image only after Save", async () => {
    editWatchlistItemFn.mockResolvedValue({ success: true });
    renderTimelineItem();

    await openEditDialog();
    fireEvent.change(screen.getByLabelText("Poster image"), { target: { value: "" } });

    expect(screen.queryByRole("img", { name: "Poster preview for Movie" })).toBeNull();
    expect(editWatchlistItemFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(editWatchlistItemFn).toHaveBeenCalledWith({
        data: {
          watchlistId: 1,
          itemId: 1,
          title: "Movie",
          releaseDate: "2024-01-01",
          posterPath: null,
        },
      });
    });
  });

  it("preserves the entered poster image when saving fails", async () => {
    editWatchlistItemFn.mockResolvedValue({
      success: false,
      message: "Poster image was not saved.",
    });
    const queryClient = renderTimelineItem();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await openEditDialog();
    fireEvent.change(screen.getByLabelText("Poster image"), {
      target: { value: "/replacement-poster.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Poster image was not saved.")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit watchlist item" })).not.toBeNull();
    expect(screen.getByLabelText("Poster image")).toHaveProperty(
      "value",
      "/replacement-poster.jpg",
    );
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

async function openEditDialog() {
  fireEvent.click(screen.getByRole("button", { name: "More actions for Movie" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  await screen.findByRole("dialog", { name: "Edit watchlist item" });
}

function renderTimelineItem() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(createElement(TimelineItemFixture, { queryClient }));

  return queryClient;
}

function TimelineItemFixture({ queryClient }: { queryClient: QueryClient }) {
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        <TimelineItem
          item={item}
          activeFilters={{
            watchlistId: item.watchlistId,
            itemOrderMode: "custom",
            unwatchedOnly: false,
            query: "",
          }}
        />
      </QueryClientProvider>
    </Provider>
  );
}
