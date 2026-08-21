// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../utils/Render";
import { SearchResults } from "@/features/search/SearchResults";

vi.mock("@/features/search/SearchMediaDetailSheet", () => ({
  SearchMediaDetailSheet: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("SearchResults", () => {
  it("opens the custom item dialog from empty results", async () => {
    render(
      <SearchResults
        results={[]}
        fetchNextPage={() => undefined}
        hasNextPage={false}
        isFetchingNextPage={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Custom Item" }));

    expect(await screen.findByRole("dialog")).not.toBeNull();
  });
});
