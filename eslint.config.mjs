import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const DRIVER_PATH = "packages/gel/src/**/*.?(m)ts";
const GENERATE_PATH = "packages/generate/src/**/*.?(m)ts";
const FEATURE_LIBRARIES_PATH = "packages/!(gel|generate)/src/**/*.?(m)ts";
const INTEGRATION_TESTS_PATH = "integration-tests/*/*.test.?(m)ts";

const ALL_PATHS = [
  DRIVER_PATH,
  GENERATE_PATH,
  FEATURE_LIBRARIES_PATH,
  INTEGRATION_TESTS_PATH,
];

export default tseslint.config(
  {
    ...eslint.configs.recommended,
    files: ALL_PATHS,
    rules: {
      ...eslint.configs.recommended.rules,
      "no-empty-function": "off",
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ALL_PATHS,
    rules: {
      ...config.rules,
      "@typescript-eslint/no-unnecessary-type-constraint": "warn",
      // Svelte doesn't correctly compile if imports of the generated /modules
      // aren't imported as 'import type' in other parts of the generated
      // querybuilder, so set this option to ensure we always do that
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  })),
  ...tseslint.configs.stylistic.map((config) => ({
    ...config,
    files: [FEATURE_LIBRARIES_PATH, INTEGRATION_TESTS_PATH],
    rules: {
      ...config.rules,
      "@typescript-eslint/class-literal-property-style": "off",
    },
  })),
);
