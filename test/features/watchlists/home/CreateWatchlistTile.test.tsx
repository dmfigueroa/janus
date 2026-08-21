// @vitest-environment jsdom

import { cleanup, render, screen } from "@test/utils/Render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateWatchlistTile } from "@/features/watchlists/home/CreateWatchlistTile";

vi.mock("@/features/watchlists/components/WatchlistFormDialog", () => ({
  WatchlistFormDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

describe("CreateWatchlistTile", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the create action in the same poster-shaped tile as watchlist cards", () => {
    render(<CreateWatchlistTile />);

    const createButton = screen.getByRole("button", { name: "Create New List" });
    const styles = window.getComputedStyle(createButton);

    expect(styles.aspectRatio).toBe("2/3");
    expect(styles.display).toBe("flex");
    expect(styles.height).not.toBe("40px");
  });
});
