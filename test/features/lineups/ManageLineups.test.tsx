// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { afterEach, expect, it, vi } from "vitest";
import { ManageLineups } from "@/features/lineups/manage/ManageLineups";
import type { LineupData } from "@/features/lineups/manage/Lineups";
const submit = vi.fn().mockResolvedValue(true);
vi.mock("@/features/lineups/manage/useLineupActions", () => ({
  useLineupActions: () => ({ submit, saving: false, error: "" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
afterEach(() => {
  cleanup();
  submit.mockClear();
});
it("saves accessible movement controls as a complete order", async () => {
  const lineups: LineupData["lineups"] = [
    {
      id: 1,
      kind: "system",
      systemKey: "movie",
      name: "Movies",
      enabled: true,
      rank: 0,
      reference: { kind: "system", key: "movie" },
      configuredWatchlists: null,
      eligibleWatchlists: [],
      configuredCount: null,
      eligibleCount: 0,
    },
    {
      id: 2,
      kind: "custom",
      systemKey: null,
      name: "Friends",
      enabled: false,
      rank: 1,
      reference: { kind: "custom", id: 2 },
      configuredWatchlists: [],
      eligibleWatchlists: [],
      configuredCount: 0,
      eligibleCount: 0,
    },
  ];
  render(<ManageLineups data={{ lineups, watchlists: [] }} />);
  expect(
    (screen.getByRole("checkbox", { name: "Show Movies on Watch Now" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: "Show Friends on Watch Now" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(screen.getByText("Custom · 0 lists · 0 available now")).not.toBeNull();
  expect(screen.getByText("Automatic")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Move Friends up" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      action: "reorder",
      references: [
        { kind: "custom", id: 2 },
        { kind: "system", key: "movie" },
      ],
    }),
  );
  await waitFor(() => expect(screen.getByText("Friends moved to position 1 of 2.")).not.toBeNull());
});
