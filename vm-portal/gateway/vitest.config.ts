import { defineConfig } from "vitest/config";

// Local config so vitest does not walk up and load the SPA's root vite.config.ts
// (which imports vite/@vitejs/plugin-react — not part of this isolated package).
export default defineConfig({
  test: {
    root: ".",
    include: ["test/**/*.test.ts"],
  },
});
