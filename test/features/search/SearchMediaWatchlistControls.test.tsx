// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@test/utils/Render";
import { SearchMediaWatchlistControls } from "@/features/search/SearchMediaWatchlistControls";

vi.mock("@/features/search/SearchWatchlistSelector", () => ({
  SearchWatchlistSelector: () => <div data-testid="watchlist-selector" />,
}));

describe("SearchMediaWatchlistControls", () => {
  afterEach(() => {
    cleanup();
  });

  it("fires onInsertionPositionChange once when selecting a custom insertion position", async () => {
    const onInsertionPositionChange = vi.fn();

    render(
      <SearchMediaWatchlistControls
        mediaType="movie"
        watchlists={[]}
        selectedWatchlistId="2"
        insertionPosition=""
        requiresInsertionChoice
        isAdding={false}
        onWatchlistSelect={vi.fn()}
        onInsertionPositionChange={onInsertionPositionChange}
        onAdd={vi.fn()}
      />,
    );

    screen.getByRole("radio", { name: "End" }).click();

    await waitFor(() => expect(onInsertionPositionChange).toHaveBeenCalledWith("end"));
    expect(onInsertionPositionChange).toHaveBeenCalledTimes(1);
  });
});
