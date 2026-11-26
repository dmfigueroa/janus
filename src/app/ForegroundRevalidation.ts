import { focusManager } from "@tanstack/react-query";

function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function subscribeBrowserLifecycle(handleFocus: () => void) {
  const handleVisibilityChange = () => {
    handleFocus();
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      handleFocus();
    }
  };
  const handleResume = () => {
    handleFocus();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow);
  document.addEventListener("resume", handleResume);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pageshow", handlePageShow);
    document.removeEventListener("resume", handleResume);
  };
}

export function installForegroundRevalidation() {
  if (!isBrowserEnvironment()) {
    return () => {};
  }

  let activeCleanup: (() => void) | undefined;

  focusManager.setEventListener((handleFocus) => {
    const cleanup = subscribeBrowserLifecycle(() => handleFocus());
    activeCleanup = cleanup;
    return () => {
      if (activeCleanup === cleanup) {
        activeCleanup = undefined;
      }
      cleanup();
    };
  });

  return () => {
    activeCleanup?.();
    activeCleanup = undefined;
  };
}
