// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { loadPwaRegistration } from "@/lib/pwa-registration";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

vi.mock("@/lib/pwa-registration", () => ({
  loadPwaRegistration: vi.fn(),
}));

const mockedLoadPwaRegistration = vi.mocked(loadPwaRegistration);

function renderPrompt() {
  render(
    <ThemeProvider attribute="class">
      <PwaUpdatePrompt />
      <Toaster />
    </ThemeProvider>,
  );
}

describe("PwaUpdatePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia =
      window.matchMedia ||
      ((query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList);
  });

  afterEach(() => {
    cleanup();
  });

  it("checks for a startup update and prompts when a waiting worker already exists", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const registration = {
      waiting: {} as ServiceWorker,
      update: vi.fn().mockResolvedValue(undefined),
    } as ServiceWorkerRegistration;

    mockedLoadPwaRegistration.mockResolvedValue({
      registerSW: vi.fn((options) => {
        queueMicrotask(() => {
          options?.onRegisteredSW?.("/sw.js", registration);
        });

        return updateServiceWorker;
      }),
    });

    renderPrompt();

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    await screen.findByText("Update available");

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(updateServiceWorker).toHaveBeenCalledWith(true);
    });
  });
});
