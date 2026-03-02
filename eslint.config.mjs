
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      obsidianmd: obsidianmd,
    },
    rules: {
      ...obsidianmd.configs.recommended,
      // You can override rules here if needed
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    },
  },
  {
      ignores: ["esbuild.config.mjs", "version-bump.mjs", "eslint.config.mjs", "debug-eslint.mjs", "main.js"]
  }
];
