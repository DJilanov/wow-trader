import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      // Auth.js relies on Next's extensionless imports, which need Vite resolution in Node tests.
      deps: { inline: ["next-auth"] },
    },
  },
});
