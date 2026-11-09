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
export class CardRotationCoordinator {
  private pending = false;
  private tail = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private publish(value: boolean) {
    this.pending = value;
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(operation: () => Promise<void>) {
    const wasPending = this.pending;
    this.publish(true);
    const work = wasPending ? this.tail.then(operation) : operation();
    this.tail = work.catch(() => {});
    const settled = this.tail;
    void this.tail.then(() => {
      if (this.tail === settled) this.publish(false);
    });
    return work;
  }
  private async refresh(effects: RotationEffects) {
    try {
      await effects.refresh();
      return true;
    } catch {
      return false;
    }
  }
  private undo(receipt: CardRotationReceipt, effects: RotationEffects) {
    return this.enqueue(async () => {
      let result: Result;
      try {
        result = await effects.undo(receipt);
      } catch {
        effects.notify({ type: "error", title: "Could not undo. Please try again." });
        return;
      }
      const refreshed = await this.refresh(effects);
      effects.notify(undoNotice(result, refreshed));
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.pending;
  perform(input: CardRotationInput, title: string, effects: RotationEffects) {
    if (this.pending) return Promise.resolve();
    return this.enqueue(async () => {
      try {
        let result: RotationResult;
        try {
          result = await effects.rotate(input);
        } catch {
          effects.notify({ type: "error", title: "Could not update watchlist. Please try again." });
          return;
        }
        const refreshed = await this.refresh(effects);
        if (!result.success) {
          effects.notify({ type: "error", title: result.message });
          return;
        }
        const receipt = result.receipt;
        effects.notify({
          ...savedNotice(refreshed, title),
          undo: () => {
            void this.undo(receipt, effects);
          },
        });
      } finally {
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
      }
    });
  }
}

export const cardRotationCoordinator = new CardRotationCoordinator();

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
