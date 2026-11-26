// @vitest-environment jsdom

import { QueryClient, focusManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installForegroundRevalidation } from "@/app/ForegroundRevalidation";

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function dispatchPageShow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("installForegroundRevalidation", () => {
  let cleanupRevalidation: (() => void) | undefined;

  afterEach(() => {
    cleanupRevalidation?.();
    cleanupRevalidation = undefined;
    setVisibilityState("visible");
  });

  it("refetches active queries on visibilitychange, persisted pageshow, and resume", async () => {
    setVisibilityState("visible");
    cleanupRevalidation = installForegroundRevalidation();
    const queryClient = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue("v1");
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {});
    const observerListener = vi.fn();
    const unsubscribeFocus = focusManager.subscribe(observerListener);

    try {
      await queryClient.prefetchQuery({ queryKey: ["lineups"], queryFn });

      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(observerListener).toHaveBeenLastCalledWith(false);

      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(observerListener).toHaveBeenLastCalledWith(true);

      observerListener.mockClear();
      dispatchPageShow(false);
      expect(observerListener).not.toHaveBeenCalled();

      dispatchPageShow(true);
      expect(observerListener).toHaveBeenCalledWith(true);

      observerListener.mockClear();
      document.dispatchEvent(new Event("resume"));
      expect(observerListener).toHaveBeenCalledWith(true);

      observerListener.mockClear();
      cleanupRevalidation();
      cleanupRevalidation = undefined;
      dispatchPageShow(true);
      document.dispatchEvent(new Event("resume"));
      expect(observerListener).not.toHaveBeenCalled();
    } finally {
      unsubscribeFocus();
      unsubscribe();
      queryClient.clear();
    }
  });
});
