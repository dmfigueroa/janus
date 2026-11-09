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

  it("hides the duplicate creation tile on mobile while preserving its desktop poster shape", () => {
    render(<CreateWatchlistTile />);

    expect(screen.queryByRole("button", { name: "Create New List" })).toBeNull();
    const createButton = screen.getByRole("button", { name: "Create New List", hidden: true });
    const styles = window.getComputedStyle(createButton);

    expect(styles.aspectRatio).toBe("2/3");
    expect(styles.display).toBe("flex");
    expect(styles.height).not.toBe("40px");
  });
});
