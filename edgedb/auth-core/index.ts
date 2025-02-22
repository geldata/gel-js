import { GelAuthError } from "@gel/auth-core";

export * from "@gel/auth-core";

export const EdgeDBAuthError = GelAuthError;

Object.defineProperty(EdgeDBAuthError.prototype, "type", {
  get() {
    return "_EdgeDBAuth";
  },
});
