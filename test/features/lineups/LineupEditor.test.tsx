// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@test/utils/Render";
import { afterEach, expect, it, vi } from "vitest";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";

const submit = vi.fn().mockResolvedValue(true);
vi.mock("@/features/lineups/manage/useLineupActions", () => ({
  useLineupActions: () => ({ submit, saving: false, error: "" }),
}));
afterEach(() => {
  cleanup();
  submit.mockClear();
});
it("searches and selects even paused watchlists when creating a lineup", async () => {
  const watchlists = [
    {
      id: 1,
      name: "Paused list",
      description: null,
      itemOrderMode: "release" as const,
      createdAt: "2024-01-01",
      updatedAt: null,
      lastWatchedAt: null,
      lastItemAddedAt: null,
      pausedAt: "2024-01-01",
      stats: {
        totalItems: 0,
        watchedItems: 0,
        progress: 0,
        nextUnwatched: null,
        coverImage: null,
        coverMediaType: null,
      },
    },
  ];
  render(<LineupEditor watchlists={watchlists} trigger={<Button>Create</Button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Weeknights" } });
  fireEvent.change(screen.getByLabelText("Search watchlists"), { target: { value: "paused" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Paused list" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("checkbox", { name: "Paused list" }) as HTMLInputElement).checked,
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      action: "create",
      name: "Weeknights",
      watchlistIds: [1],
    }),
  );
});
