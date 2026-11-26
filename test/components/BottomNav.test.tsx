// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@test/utils/Render";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

import { BottomNav } from "@/components/BottomNav";

describe("BottomNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders primary navigation links for Watch Now, My Lists, and Search", () => {
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: "Watch Now" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "My Lists" }).getAttribute("href")).toBe("/watchlists");
    expect(screen.getByRole("link", { name: "Search" }).getAttribute("href")).toBe("/search");
  });
});
