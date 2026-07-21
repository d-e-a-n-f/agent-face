import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Globals enable @testing-library/react's automatic cleanup in the
    // jsdom-pragma react tests.
    globals: true,
  },
});
