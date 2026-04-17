import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54332/postgres",
    },
  },
});
