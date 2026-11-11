import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "csv-raw",
      load(id) {
        const path = id.split("?")[0];
        if (path.endsWith(".csv")) {
          return `export default ${JSON.stringify(readFileSync(path, "utf8"))};`;
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});