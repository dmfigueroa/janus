import { afterEach, expect, it, vi } from "vitest";
import { createCardRotationCoordinator } from "@/features/watchlists/rotation/CardRotationCoordinator";

const input = { watchlistId: 1, itemId: 2, action: "skip" as const };
const receipt = { ...input, previousPosition: null, appliedPosition: "position" };
afterEach(() => vi.useRealTimers());
function setup() {
  const coordinator = createCardRotationCoordinator();
  const notices: { title: string; undo?: () => void }[] = [];
  const effects = {
    rotate: vi.fn().mockResolvedValue({ success: true, receipt }),
    undo: vi.fn().mockResolvedValue({ success: true }),
    refresh: vi.fn().mockResolvedValue(undefined),
    notify: (notice: { title: string; undo?: () => void }) => notices.push(notice),
  };
  return { coordinator, effects, notices };
}
it("retains undo after a saved action fails to refresh and serializes waiting undos", async () => {
  vi.useFakeTimers();
  const { coordinator, effects, notices } = setup();
  effects.refresh.mockRejectedValueOnce(new Error("offline"));
  const action = coordinator.perform(input, "Skipped", effects);
  await vi.advanceTimersByTimeAsync(0);
  expect(notices[0].title).toContain("Saved, but could not refresh");
  expect(coordinator.getSnapshot()).toBe(true);
  await coordinator.perform(input, "Skipped", effects);
  expect(effects.rotate).toHaveBeenCalledTimes(1);
  let finishUndo = () => {};
  effects.undo.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishUndo = () => resolve({ success: true });
      }),
  );
  notices[0].undo?.();
  notices[0].undo?.();
  await vi.advanceTimersByTimeAsync(600);
  await action;
  expect(effects.undo).toHaveBeenCalledTimes(1);
  expect(coordinator.getSnapshot()).toBe(true);
  finishUndo();
  await vi.advanceTimersByTimeAsync(0);
  expect(effects.undo).toHaveBeenCalledTimes(2);
  expect(coordinator.getSnapshot()).toBe(false);
});
it("releases pending after request failure and cooldown", async () => {
  vi.useFakeTimers();
  const { coordinator, effects, notices } = setup();
  effects.rotate.mockRejectedValueOnce(new Error("offline"));
  const action = coordinator.perform(input, "Skipped", effects);
  await vi.advanceTimersByTimeAsync(599);
  expect(coordinator.getSnapshot()).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  await action;
  expect(coordinator.getSnapshot()).toBe(false);
  expect(notices[0].title).toContain("Could not update");
  expect(effects.refresh).not.toHaveBeenCalled();
});
it("continues queued undo after a request failure", async () => {
  vi.useFakeTimers();
  const { coordinator, effects, notices } = setup();
  const action = coordinator.perform(input, "Skipped", effects);
  await vi.advanceTimersByTimeAsync(0);
  effects.undo.mockRejectedValueOnce(new Error("offline"));
  notices[0].undo?.();
  notices[0].undo?.();
  await vi.advanceTimersByTimeAsync(600);
  await action;
  expect(effects.undo).toHaveBeenCalledTimes(2);
  expect(notices[1].title).toContain("Could not undo");
  expect(notices[2].title).toBe("Action undone");
  expect(coordinator.getSnapshot()).toBe(false);
});
