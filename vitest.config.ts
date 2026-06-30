import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(
        __dirname,
        "test/setup/server-only-shim.ts"
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/setup/globalSetup.ts"],
    env: { DATABASE_URL: "file:./test.db" },
    fileParallelism: false,
  },
});
