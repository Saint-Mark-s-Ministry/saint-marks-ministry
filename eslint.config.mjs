import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/mobile/.expo/**",
      "apps/mobile/dist/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "apps/**", // the Expo app has its own toolchain
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["apps/mobile/**/*.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Expo config plugins are loaded by Node's own `require()` directly from
    // app.json, outside the bundler/TS pipeline — CommonJS is the correct
    // format here, not a style choice.
    files: ["apps/mobile/plugins/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // Core React hooks rules (stable, valuable).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",

      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    },
  },
  {
    files: ["scripts/**/*.ts", "prisma/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["public/sw.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
