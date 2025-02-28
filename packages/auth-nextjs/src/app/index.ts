import {
  type TokenData,
  ConfigurationError,
  PKCEError,
  InvalidDataError,
} from "@gel/auth-core";
import type { Client } from "gel";
import { cookies } from "next/headers";
import { cache } from "react";

import {
  NextAuth,
  NextAuthSession,
  type NextAuthOptions,
  type BuiltinProviderNames,
  type CreateAuthRouteHandlers,
  _extractParams,
} from "../shared";

export * from "@gel/auth-core/errors";
export {
  NextAuthSession,
  type NextAuthOptions,
  type BuiltinProviderNames,
  type TokenData,
  type CreateAuthRouteHandlers,
};

export class NextAppAuth extends NextAuth {
  getSession = cache(async () => {
    const cookieStore = await cookies();
    return new NextAuthSession(
      this.client,
      cookieStore.get(this.options.authCookieName)?.value.split(";")[0] ||
        cookieStore.get("edgedb-session")?.value.split(";")[0] ||
        null,
    );
  });

  createServerActions() {
    return {
      signout: async () => {
        this.deleteAuthCookie();
      },
      emailPasswordSignIn: async (
        data: FormData | { email: string; password: string },
      ) => {
        const [email, password] = _extractParams(
          data,
          ["email", "password"],
          "email or password missing",
        );
        const tokenData = await (
          await this.core
        ).signinWithEmailPassword(email, password);
        await this.setAuthCookie(tokenData.auth_token);
        return tokenData;
      },
      emailPasswordSignUp: async (
        data: FormData | { email: string; password: string },
      ) => {
        const [email, password] = _extractParams(
          data,
          ["email", "password"],
          "email or password missing",
        );
        const result = await (
          await this.core
        ).signupWithEmailPassword(
          email,
          password,
          `${this._authRoute}/emailpassword/verify`,
        );
        await this.setVerifierCookie(result.verifier);
        if (result.status === "complete") {
          await this.setAuthCookie(result.tokenData.auth_token);
          return result.tokenData;
        }
        return null;
      },
      emailPasswordSendPasswordResetEmail: async (
        data: FormData | { email: string },
      ) => {
        if (!this.options.passwordResetPath) {
          throw new ConfigurationError(
            `'passwordResetPath' option not configured`,
          );
        }
        const [email] = _extractParams(data, ["email"], "email missing");
        const { verifier } = await (
          await this.core
        ).sendPasswordResetEmail(
          email,
          new URL(
            this.options.passwordResetPath,
            this.options.baseUrl,
          ).toString(),
        );
        await this.setVerifierCookie(verifier);
      },
      emailPasswordResetPassword: async (
        data: FormData | { reset_token: string; password: string },
      ) => {
        const cookieStore = await cookies();
        const verifier =
          cookieStore.get(this.options.pkceVerifierCookieName)?.value ||
          cookieStore.get("gel-pkce-verifier")?.value;
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const [resetToken, password] = _extractParams(
          data,
          ["reset_token", "password"],
          "reset_token or password missing",
        );
        const tokenData = await (
          await this.core
        ).resetPasswordWithResetToken(resetToken, verifier, password);
        await this.setAuthCookie(tokenData.auth_token);
        this.deleteVerifierCookie();
        return tokenData;
      },
      emailPasswordResendVerificationEmail: async (
        data: FormData | { verification_token: string } | { email: string },
      ) => {
        const verificationToken =
          data instanceof FormData
            ? data.get("verification_token")
            : "verification_token" in data
              ? data.verification_token
              : null;
        const email =
          data instanceof FormData
            ? data.get("email")
            : "email" in data
              ? data.email
              : null;

        if (verificationToken) {
          await (
            await this.core
          ).resendVerificationEmail(verificationToken.toString());
        } else if (email) {
          const { verifier } = await (
            await this.core
          ).resendVerificationEmailForEmail(
            email.toString(),
            `${this._authRoute}/emailpassword/verify`,
          );

          const cookieStore = await cookies();
          cookieStore.set({
            name: this.options.pkceVerifierCookieName,
            value: verifier,
            httpOnly: true,
            sameSite: "strict",
          });
        } else {
          throw new InvalidDataError(
            "either verification_token or email must be provided",
          );
        }
      },
      magicLinkSignUp: async (data: FormData | { email: string }) => {
        if (!this.options.magicLinkFailurePath) {
          throw new ConfigurationError(
            `'magicLinkFailurePath' option not configured`,
          );
        }
        const [email] = _extractParams(data, ["email"], "email missing");
        const { verifier } = await (
          await this.core
        ).signupWithMagicLink(
          email,
          `${this._authRoute}/magiclink/callback?isSignUp=true`,
          new URL(
            this.options.magicLinkFailurePath,
            this.options.baseUrl,
          ).toString(),
        );
        await this.setVerifierCookie(verifier);
      },
      magicLinkSignIn: async (data: FormData | { email: string }) => {
        if (!this.options.magicLinkFailurePath) {
          throw new ConfigurationError(
            `'magicLinkFailurePath' option not configured`,
          );
        }
        const [email] = _extractParams(data, ["email"], "email missing");
        const { verifier } = await (
          await this.core
        ).signinWithMagicLink(
          email,
          `${this._authRoute}/magiclink/callback`,
          new URL(
            this.options.magicLinkFailurePath,
            this.options.baseUrl,
          ).toString(),
        );
        await this.setVerifierCookie(verifier);
      },
    };
  }
}

export default function createNextAppAuth(
  client: Client,
  options: NextAuthOptions,
) {
  return new NextAppAuth(client, options);
}
