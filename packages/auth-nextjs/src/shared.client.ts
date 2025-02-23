import {
  type BuiltinOAuthProviderNames,
  type emailPasswordProviderName,
} from "@gel/auth-core";
import { WebAuthnClient } from "@gel/auth-core/webauthn";

export * as webauthn from "@gel/auth-core/webauthn";

export type BuiltinProviderNames =
  | BuiltinOAuthProviderNames
  | typeof emailPasswordProviderName;

export interface NextAuthOptions {
  baseUrl: string;
  authRoutesPath?: string;
  authCookieName?: string;
  pkceVerifierCookieName?: string;
  passwordResetPath?: string;
  magicLinkFailurePath?: string;
}

type OptionalOptions = "passwordResetPath" | "magicLinkFailurePath";

export abstract class NextAuthHelpers {
  /** @internal */
  readonly options: Required<Omit<NextAuthOptions, OptionalOptions>> &
    Pick<NextAuthOptions, OptionalOptions>;
  readonly webAuthnClient: WebAuthnClient;
  readonly isSecure: boolean;

  /** @internal */
  constructor(options: NextAuthOptions) {
    this.options = {
      baseUrl: options.baseUrl.replace(/\/$/, ""),
      authRoutesPath: options.authRoutesPath?.replace(/^\/|\/$/g, "") ?? "auth",
      authCookieName: options.authCookieName ?? "gel-session",
      pkceVerifierCookieName:
        options.pkceVerifierCookieName ?? "gel-pkce-verifier",
      passwordResetPath: options.passwordResetPath,
      magicLinkFailurePath: options.magicLinkFailurePath,
    };
    this.webAuthnClient = new WebAuthnClient({
      signupOptionsUrl: `${this._authRoute}/webauthn/signup/options`,
      signupUrl: `${this._authRoute}/webauthn/signup`,
      signinOptionsUrl: `${this._authRoute}/webauthn/signin/options`,
      signinUrl: `${this._authRoute}/webauthn/signin`,
      verifyUrl: `${this._authRoute}/webauthn/verify`,
    });
    this.isSecure = this.options.baseUrl.startsWith("https");
  }

  protected get _authRoute() {
    return `${this.options.baseUrl}/${this.options.authRoutesPath}`;
  }

  getOAuthUrl(providerName: BuiltinOAuthProviderNames) {
    return `${this._authRoute}/oauth?${new URLSearchParams({
      provider_name: providerName,
    }).toString()}`;
  }

  getBuiltinUIUrl() {
    return `${this._authRoute}/builtin/signin`;
  }
  getBuiltinUISignUpUrl() {
    return `${this._authRoute}/builtin/signup`;
  }

  getSignoutUrl() {
    return `${this._authRoute}/signout`;
  }
}
