import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { Provider } from "@/app/Provider";

function TestProvider({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, {
    ...options,
    wrapper: TestProvider,
  });
}

export * from "@testing-library/react";
