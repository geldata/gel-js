import { type Client } from "gel";
import { type TokenData } from "@gel/auth-core";
import {
  type BuiltinProviderNames,
  type CreateAuthRouteHandlers,
  NextAuth,
  type NextAuthOptions,
  NextAuthSession,
} from "../shared";

export * from "@gel/auth-core/errors";
export {
  NextAuthSession,
  type NextAuthOptions,
  type BuiltinProviderNames,
  type TokenData,
  type CreateAuthRouteHandlers,
};

export default function createNextPagesServerAuth(
  client: Client,
  options: NextAuthOptions,
) {
  return new NextPagesAuth(client, options);
}

const sessionCache = new WeakMap<any, NextAuthSession>();

export class NextPagesAuth extends NextAuth {
  getSession(req: { cookies: Partial<Record<string, string>> }) {
    const session =
      sessionCache.get(req) ??
      new NextAuthSession(
        this.client,
        req.cookies[this.options.authCookieName]?.split(";")[0] ||
          req.cookies["edgedb-session"]?.split(";")[0] ||
          null,
      );
    sessionCache.set(req, session);
    return session;
  }
}
