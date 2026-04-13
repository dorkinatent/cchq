import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Claude Agent SDK and various stream events return shapes that are
  // narrowed at use sites; `any` is the pragmatic choice in those spots.
  // Demote from error to warn so CI still flags real bugs without drowning
  // in SDK-edge noise.
  {
    rules: {
      // SDK/stream-event message shapes are dynamic; `any` is pragmatic at
      // those sites. Demote so CI doesn't drown in noise.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler heuristics (via react-hooks plugin umbrella) flag
      // many legitimate patterns — setState-in-useEffect for polling,
      // forward refs to handlers defined later in the render. Downgrade
      // the umbrella rule to warn so CI still surfaces them but doesn't
      // fail on advisory signals.
      "react-hooks/hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/no-deriving-state-in-effects": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project-specific (lint runs against src/, not these):
    "node_modules/**",
    ".worktrees/**",
    "local-n8n/**",
    "drizzle/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
