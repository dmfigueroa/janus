// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@test/utils/Render";

const { backMock } = vi.hoisted(() => ({ backMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useRouter: () => ({
    history: {
      back: backMock,
    },
  }),
}));

import { NotFound } from "@/components/NotFound";

describe("NotFound", () => {
  beforeEach(() => {
    backMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates back through router history when clicking Go Back", () => {
    render(<NotFound />);

    fireEvent.click(screen.getByRole("button", { name: "Go Back" }));

    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it("links Go Home to the root route", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Go Home" }).getAttribute("href")).toBe("/");
  });
});
