import {
  type BuiltinProviderNames,
  NextAuthHelpers,
  type NextAuthOptions,
} from "../shared.client";

export * from "@gel/auth-core/errors";
export { type NextAuthOptions, type BuiltinProviderNames };

export default function createNextAppClientAuth(options: NextAuthOptions) {
  return new NextAppClientAuth(options);
}

export class NextAppClientAuth extends NextAuthHelpers {
  constructor(options: NextAuthOptions) {
    super(options);
  }
}
