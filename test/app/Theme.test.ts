import { describe, expect, it } from "vitest";
import { janusSystem } from "@/app/Theme";

describe("dialog motion recipe", () => {
  it("overrides default scale motion and disables it for reduced motion in both states", () => {
    const recipe = janusSystem.getSlotRecipe("dialog");
    const styles = janusSystem.sva(recipe)({ motionPreset: "scale" });
    expect(styles.content).toMatchObject({
      "@layer recipes": {
        "&:is([open], [data-open], [data-state=open])": {
          animationName: "dialog-enter",
          animationDuration: "200ms",
          "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
        },
        "&:is([closed], [data-closed], [data-state=closed])": {
          animationName: "dialog-exit",
          animationDuration: "140ms",
          "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
        },
      },
    });
  });
});
