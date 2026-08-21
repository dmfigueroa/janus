import { describe, expect, it } from "vitest";
import { janusSystem } from "@/app/Theme";

describe("Janus Chakra theme", () => {
  it("keeps the default Tabs variant with a pink accent", () => {
    expect(janusSystem.getSlotRecipe("tabs").defaultVariants).toMatchObject({
      colorPalette: "pink",
      variant: "line",
    });
  });
});
