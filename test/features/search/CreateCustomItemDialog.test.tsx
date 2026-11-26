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
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

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

  it("rejects invalid release dates and keeps the dialog open", async () => {
    const onCreated = vi.fn();

    render(
      <CreateCustomItemDialog onCreated={onCreated}>
        <button type="button">Create custom item</button>
      </CreateCustomItemDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create custom item" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bad Date Story" } });
    fireEvent.change(screen.getByLabelText("Year (Optional)"), { target: { value: "2026-02-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    expect(await screen.findByText("Release date must be a valid calendar date.")).not.toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("accepts a full YYYY-MM-DD release date and derives its year", async () => {
    const onCreated = vi.fn();

    render(
      <CreateCustomItemDialog onCreated={onCreated}>
        <button type="button">Create custom item</button>
      </CreateCustomItemDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create custom item" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Dated Story  " } });
    fireEvent.change(screen.getByLabelText("Year (Optional)"), { target: { value: "2026-05-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Dated Story",
          year: "2026",
          releaseDate: "2026-05-14",
        }),
      );
    });
  });

  it("assigns unique generated field IDs and focuses its own title input", async () => {
    render(
      <>
        <CreateCustomItemDialog onCreated={vi.fn()} open />
        <CreateCustomItemDialog onCreated={vi.fn()} open />
      </>,
    );

    const titleInputs = await screen.findAllByLabelText("Title");
    const typeSelects = screen.getAllByLabelText("Type");
    const yearInputs = screen.getAllByLabelText("Year (Optional)");
    const descriptionInputs = screen.getAllByLabelText("Description (Optional)");

    expect(titleInputs).toHaveLength(2);
    expect(titleInputs[0]?.id).not.toBe("custom-item-title");
    expect(titleInputs[0]?.id).not.toBe(titleInputs[1]?.id);
    expect(typeSelects[0]?.id).not.toBe(typeSelects[1]?.id);
    expect(yearInputs[0]?.id).not.toBe(yearInputs[1]?.id);
    expect(descriptionInputs[0]?.id).not.toBe(descriptionInputs[1]?.id);
  });
});
