import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "functions/**/__tests__/*.test.js",
      "public/**/__tests__/*.test.js"
    ]
  }
});
