module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["./dist", "./esm", "./mts", "./cjs", "./deno"],
  globalSetup: "./globalSetup.ts",
  transform: {},
  globals: {},
};
