import { describe, expect, it } from "vitest";
import { janusSystem } from "@/app/Theme";

describe("Janus Chakra theme", () => {
  it("defaults Tabs to the pink plain variant", () => {
    expect(janusSystem.getSlotRecipe("tabs").defaultVariants).toMatchObject({
      colorPalette: "pink",
      variant: "plain",
    });
  });
});
