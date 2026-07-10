import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Component / interaction tests. Runs under Vitest + happy-dom and is scoped
// to *.test.tsx ONLY, so it never collides with the existing node:test lib
// suite (*.test.ts, run via `npm run test:watch-list`). Vitest 4 transforms
// JSX via oxc out of the box — no @vitejs/plugin-react (its babel peer chain
// conflicts here and buys us nothing for tests).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
