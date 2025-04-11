import {
  type BuiltinProviderNames,
  SolidAuthHelpers,
  type SolidAuthOptions,
} from "../shared/index.js";

export * from "@edgedb/auth-core/errors";
export { type BuiltinProviderNames, type SolidAuthOptions };

export default function createSolidClientAuth(options: SolidAuthOptions) {
  return new SolidClientAuth(options);
}

export class SolidClientAuth extends SolidAuthHelpers {}
