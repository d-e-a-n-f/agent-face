import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Globals enable @testing-library/react's automatic DOM cleanup.
    globals: true,
  },
});
