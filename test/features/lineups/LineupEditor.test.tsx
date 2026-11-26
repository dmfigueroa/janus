// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@test/utils/Render";
import { afterEach, expect, it, vi } from "vitest";
import { LineupEditor } from "@/features/lineups/components/LineupEditor";
import { useLineupEditor } from "@/features/lineups/manage/useLineupEditor";
import type { LineupData } from "@/features/lineups/manage/Lineups";

const submit = vi.fn().mockResolvedValue(true);
vi.mock("@/features/lineups/manage/useLineupActions", () => ({
  useLineupActions: () => ({
    submit,
    saving: false,
    error: "",
    errorField: "",
    clearError: vi.fn(),
  }),
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
  watchlists.push({ ...watchlists[0], id: 2, name: "Other list" });
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
  expect(screen.getByText("1 selected")).not.toBeNull();
  fireEvent.change(screen.getByLabelText("Search watchlists"), { target: { value: "missing" } });
  expect(screen.getByText("No watchlists match your filters.")).not.toBeNull();
  expect(screen.getByText("1 selected")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect((screen.getByRole("checkbox", { name: "Paused list" }) as HTMLInputElement).checked).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Show selected only" }));
  await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Other list" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Create lineup" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      action: "create",
      name: "Weeknights",
      watchlistIds: [1],
    }),
  );
});

it("associates a required name error with the field and permits an empty lineup", async () => {
  render(<LineupEditor watchlists={[]} trigger={<Button>Open editor</Button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
  expect(
    await screen.findByText(
      "No watchlists yet. You can create this lineup now and add lists later.",
    ),
  ).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create lineup" }));
  const input = screen.getByLabelText("Name") as HTMLInputElement;
  expect(await screen.findByText("Enter a name for this lineup.")).not.toBeNull();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Weeknights" } });
  fireEvent.click(screen.getByRole("button", { name: "Create lineup" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ action: "create", name: "Weeknights", watchlistIds: [] }),
  );
});

it("preselects configured edit members and does not submit when searching with Enter", async () => {
  const list: LineupData["watchlists"][number] = {
    id: 7,
    name: "Weekend",
    description: null,
    itemOrderMode: "release",
    createdAt: "2024-01-01",
    updatedAt: null,
    lastWatchedAt: null,
    lastItemAddedAt: null,
    pausedAt: null,
    stats: {
      totalItems: 0,
      watchedItems: 0,
      progress: 0,
      nextUnwatched: null,
      coverImage: null,
      coverMediaType: null,
    },
  };
  const lineup: LineupData["lineups"][number] = {
    id: 3,
    kind: "custom",
    systemKey: null,
    name: "Friends",
    enabled: false,
    rank: 1,
    reference: { kind: "custom", id: 3 },
    configuredWatchlists: [list],
    eligibleWatchlists: [],
    configuredCount: 1,
    eligibleCount: 0,
  };
  render(<LineupEditor lineup={lineup} watchlists={[list]} trigger={<Button>Edit</Button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const search = await screen.findByLabelText("Search watchlists");
  expect((screen.getByRole("checkbox", { name: "Weekend" }) as HTMLInputElement).checked).toBe(
    true,
  );
  fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      action: "edit",
      reference: { kind: "custom", id: 3 },
      name: "Friends",
      watchlistIds: [7],
    }),
  );
});

it("deduplicates repeated watchlist selections in useLineupEditor", () => {
  const { result } = renderHook(() => useLineupEditor(undefined, []));

  act(() => {
    result.current.toggle(42, true);
    result.current.toggle(42, true);
  });

  expect(result.current.selected).toEqual([42]);

  act(() => {
    result.current.toggle(42, false);
  });

  expect(result.current.selected).toEqual([]);
});
