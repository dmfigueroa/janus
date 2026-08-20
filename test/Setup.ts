import { vi } from "vitest";

const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}));

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const cssEscape = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
vi.stubGlobal("CSS", { ...globalThis.CSS, escape: cssEscape });

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
