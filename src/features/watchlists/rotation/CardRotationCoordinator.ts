import type { CardRotationInput, CardRotationReceipt } from "./CardRotation";

type Result = { success: false; message: string } | { success: true };
type RotationResult =
  | { success: false; message: string }
  | { success: true; receipt: CardRotationReceipt };
type Notice = { title: string; type: "success" | "error"; undo?: () => void };
type RotationEffects = {
  rotate: (input: CardRotationInput) => Promise<RotationResult>;
  undo: (receipt: CardRotationReceipt) => Promise<Result>;
  refresh: () => Promise<void>;
  notify: (notice: Notice) => void;
};

// One coordinator per mounted application, shared by all card hooks.
export function createCardRotationCoordinator() {
  let pending = false;
  let tail = Promise.resolve();
  const listeners = new Set<() => void>();
  function publish(value: boolean) {
    pending = value;
    listeners.forEach((listener) => listener());
  }
  function enqueue(operation: () => Promise<void>) {
    const wasPending = pending;
    publish(true);
    const work = wasPending ? tail.then(operation) : operation();
    tail = work.catch(() => {});
    const settled = tail;
    void tail.then(() => {
      if (tail === settled) publish(false);
    });
    return work;
  }
  async function refresh(effects: RotationEffects) {
    try {
      await effects.refresh();
      return true;
    } catch {
      return false;
    }
  }
  function undo(receipt: CardRotationReceipt, effects: RotationEffects) {
    return enqueue(async () => {
      let result: Result;
      try {
        result = await effects.undo(receipt);
      } catch {
        effects.notify({ type: "error", title: "Could not undo. Please try again." });
        return;
      }
      const refreshed = await refresh(effects);
      effects.notify(undoNotice(result, refreshed));
    });
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => pending,
    perform(input: CardRotationInput, title: string, effects: RotationEffects) {
      if (pending) return Promise.resolve();
      return enqueue(async () => {
        try {
          let result: RotationResult;
          try {
            result = await effects.rotate(input);
          } catch {
            effects.notify({
              type: "error",
              title: "Could not update watchlist. Please try again.",
            });
            return;
          }
          const refreshed = await refresh(effects);
          if (!result.success) {
            effects.notify({ type: "error", title: result.message });
            return;
          }
          const receipt = result.receipt;
          effects.notify({
            ...savedNotice(refreshed, title),
            undo: () => {
              void undo(receipt, effects);
            },
          });
        } finally {
          await new Promise<void>((resolve) => setTimeout(resolve, 600));
        }
      });
    },
  };
}

export const cardRotationCoordinator = createCardRotationCoordinator();

function savedNotice(refreshed: boolean, title: string): Notice {
  if (!refreshed)
    return { type: "error", title: "Saved, but could not refresh. Please refresh the page." };
  return { type: "success", title };
}
function undoNotice(result: Result, refreshed: boolean): Notice {
  if (!result.success) return { type: "error", title: result.message };
  if (!refreshed)
    return { type: "error", title: "Undone, but could not refresh. Please refresh the page." };
  return { type: "success", title: "Action undone" };
}
