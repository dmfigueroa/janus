// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@test/utils/Render";

const { invalidateMock } = vi.hoisted(() => ({ invalidateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useRouter: () => ({
    invalidate: invalidateMock,
  }),
}));

import { RouteError } from "@/components/RouteError";

describe("RouteError", () => {
  beforeEach(() => {
    invalidateMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the error message and retries via reset and router invalidation", () => {
    const reset = vi.fn();

    render(<RouteError error={new Error("Failed to load watchlist")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).not.toBeNull();
    expect(screen.getByText("Failed to load watchlist")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Go Home" }).getAttribute("href")).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the error message is blank", () => {
    render(<RouteError error={new Error("   ")} reset={vi.fn()} />);

    expect(screen.getByText("Something went wrong while loading this page.")).not.toBeNull();
  });
});
