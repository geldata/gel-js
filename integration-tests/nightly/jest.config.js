module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["./dist", "./esm", "./mts", "./cjs"],
  globalSetup: "./globalSetup.ts",
  transform: {},
  globals: {},
};
