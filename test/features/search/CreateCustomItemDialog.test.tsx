// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "../../utils/Render";
import { CreateCustomItemDialog } from "@/features/search/CreateCustomItemDialog";

afterEach(() => {
  cleanup();
});

describe("CreateCustomItemDialog", () => {
  it("creates a custom item from the entered fields", async () => {
    const onCreated = vi.fn();

    render(
      <CreateCustomItemDialog onCreated={onCreated}>
        <button type="button">Create custom item</button>
      </CreateCustomItemDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create custom item" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A Custom Story" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "book" } });
    fireEvent.change(screen.getByLabelText("Year (Optional)"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("Description (Optional)"), {
      target: { value: "A short description" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Item" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        id: expect.stringMatching(/^custom-/),
        title: "A Custom Story",
        mediaType: "book",
        source: "custom",
        poster: null,
        year: "2026",
        releaseDate: "2026",
        overview: "A short description",
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes without creating an item when cancelled", async () => {
    const onCreated = vi.fn();

    render(
      <CreateCustomItemDialog onCreated={onCreated}>
        <button type="button">Create custom item</button>
      </CreateCustomItemDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create custom item" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onCreated).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
