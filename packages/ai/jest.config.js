import { createJsWithTsEsmPreset } from "ts-jest";

export default {
  testEnvironment: "node",
  testPathIgnorePatterns: ["./dist"],
  globalSetup: "./test/globalSetup.ts",
  globalTeardown: "./test/globalTeardown.ts",
  ...createJsWithTsEsmPreset({
    tsconfig: "./tsconfig.test.json",
  }),
};
