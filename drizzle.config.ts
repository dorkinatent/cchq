import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";

// Load .env.local if it exists (Next.js auto-loads this for `npm run dev`
// but standalone tools like drizzle-kit don't).
try {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.local doesn't exist — DATABASE_URL must be set externally
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
