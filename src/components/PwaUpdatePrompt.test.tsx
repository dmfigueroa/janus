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
type PwaRegistrationModule = Awaited<ReturnType<typeof loadPwaRegistration>>;
type RegisterSW = PwaRegistrationModule["registerSW"];

function createPwaRegistrationModule(registerSW: RegisterSW): PwaRegistrationModule {
  return {
    default: {} as PwaRegistrationModule,
    registerSW,
  } as PwaRegistrationModule;
}

function createServiceWorkerRegistration(
  overrides: Partial<ServiceWorkerRegistration>,
): ServiceWorkerRegistration {
  return {
    update: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

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
    const registration = createServiceWorkerRegistration({
      waiting: {} as ServiceWorker,
      update: vi.fn().mockResolvedValue(undefined),
    });

    mockedLoadPwaRegistration.mockResolvedValue(
      createPwaRegistrationModule(
        vi.fn((options) => {
          queueMicrotask(() => {
            options?.onRegisteredSW?.("/sw.js", registration);
          });

          return updateServiceWorker;
        }) as RegisterSW,
      ),
    );

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

  it("shows a single update prompt when a new version becomes waiting during startup", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const registration = createServiceWorkerRegistration({
      update: vi.fn().mockResolvedValue(undefined),
    });

    let registerOptions: Parameters<RegisterSW>[0] | undefined;

    mockedLoadPwaRegistration.mockResolvedValue(
      createPwaRegistrationModule(
        vi.fn((options) => {
          registerOptions = options;

          queueMicrotask(() => {
            options?.onRegisteredSW?.("/sw.js", registration);
          });

          return updateServiceWorker;
        }) as RegisterSW,
      ),
    );

    renderPrompt();

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    registerOptions?.onNeedRefresh?.();
    registerOptions?.onNeedRefresh?.();

    await screen.findByText("Update available");

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Update" })).toHaveLength(1);
    });
  });

  it("keeps update-check failures silent for users", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const registration = createServiceWorkerRegistration({
      update: vi.fn().mockRejectedValue(new Error("update failed")),
    });

    mockedLoadPwaRegistration.mockResolvedValue(
      createPwaRegistrationModule(
        vi.fn((options) => {
          queueMicrotask(() => {
            options?.onRegisteredSW?.("/sw.js", registration);
          });

          return vi.fn().mockResolvedValue(undefined);
        }) as RegisterSW,
      ),
    );

    renderPrompt();

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("SW update check failed:", expect.any(Error));
    });

    expect(screen.queryByText("Update available")).toBeNull();

    consoleError.mockRestore();
  });

  it("keeps registration setup failures silent for users", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedLoadPwaRegistration.mockRejectedValue(new Error("registration failed"));

    renderPrompt();

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "PWA registration setup failed:",
        expect.any(Error),
      );
    });

    expect(screen.queryByText("Update available")).toBeNull();

    consoleError.mockRestore();
  });
});
