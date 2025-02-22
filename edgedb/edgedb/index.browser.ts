import { GelError } from "gel/dist/index.shared.js";

export * from "gel/dist/index.browser.js";

export const EdgeDBError = GelError;

Object.defineProperty(EdgeDBError, "name", { value: "EdgeDBError" });
