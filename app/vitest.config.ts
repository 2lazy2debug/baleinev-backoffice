import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests only — no jsdom, no React rendering. The repo's UI is verified by
 * `npm run build` (types), `npm run lint` and `npm run check:design`; what those
 * cannot see is the *logic* inside `lib/` and the server actions — the "refuse X
 * while Y exists" rules, the FormData parsing, the money maths. That is what
 * lives here.
 *
 * `"use server"` files can be imported and called directly: a server action is a
 * plain async function, and the tests mock the three things it reaches for that
 * a test process does not have — `next/cache`, `@/lib/access` and `@/lib/db`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
