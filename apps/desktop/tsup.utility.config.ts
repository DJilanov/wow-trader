import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/utility/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  outDir: "dist-utility",
  external: ["electron"],
  noExternal: ["@wow-trader/companion-core", "@wow-trader/contracts", "zod", "luaparse"],
});
