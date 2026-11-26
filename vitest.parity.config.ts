import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    viteReact(),
  ],
  test: {
    include: ["test/parity/**/*.test.ts"],
    setupFiles: ["./test/Setup.ts"],
    testTimeout: 60_000,
  },
});
