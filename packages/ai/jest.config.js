export const TS_EXT_TO_TREAT_AS_ESM = [".ts", ".tsx", ".mts"];
export const JS_EXT_TO_TREAT_AS_ESM = [".jsx"];
export const ESM_TS_JS_TRANSFORM_PATTERN = "^.+\\.m?[tj]sx?$";

export default {
  testEnvironment: "node",
  testPathIgnorePatterns: ["./dist"],
  globalSetup: "./test/globalSetup.ts",
  globalTeardown: "./test/globalTeardown.ts",
  extensionsToTreatAsEsm: [
    ...JS_EXT_TO_TREAT_AS_ESM,
    ...TS_EXT_TO_TREAT_AS_ESM,
  ],
  transform: {
    [ESM_TS_JS_TRANSFORM_PATTERN]: [
      "ts-jest",
      {
        tsconfig: "./tsconfig.test.json",
        useESM: true,
      },
    ],
  },
};
