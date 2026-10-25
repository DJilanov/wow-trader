import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "artifacts/**",
      "catalog-snapshots/**",
      "raw-uploads/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["infra/simulator/**/*.mjs"],
    languageOptions: {
      // Simulator scripts run on Node 20, which supplies these built-ins.
      globals: { Buffer: "readonly", structuredClone: "readonly", URL: "readonly" },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: { require: "readonly", module: "readonly", __dirname: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
