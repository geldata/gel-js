import {
  redirect,
  type Cookies,
  type RequestEvent,
  type Handle,
} from "@sveltejs/kit";
import type { Client } from "gel";
import {
  Auth,
  builtinOAuthProviderNames,
  type BuiltinOAuthProviderNames,
  type TokenData,
  type emailPasswordProviderName,
  BackendError,
  ConfigurationError,
  PKCEError,
  InvalidDataError,
  OAuthProviderFailureError,
  GelAuthError,
  MagicLinkFailureError,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@gel/auth-core";
import {
  ClientAuth,
  getConfig,
  type AuthConfig,
  type AuthOptions,
} from "./client.js";

export * from "@gel/auth-core/errors";
export type { TokenData, AuthOptions, Client };

export type BuiltinProviderNames =
  | BuiltinOAuthProviderNames
  | typeof emailPasswordProviderName;

type ParamsOrError<
  Result extends object,
  ErrorDetails extends object = object,
> =
  | ({ error: null } & { [Key in keyof ErrorDetails]?: undefined } & Result)
  | ({ error: Error } & ErrorDetails & { [Key in keyof Result]?: undefined });

export interface AuthRouteHandlers {
  onOAuthCallback?: (
    params: ParamsOrError<{
      tokenData: TokenData;
      provider: BuiltinOAuthProviderNames;
      isSignUp: boolean;
    }>,
  ) => Promise<never>;
  onBuiltinUICallback?: (
    params: ParamsOrError<
      (
        | {
            tokenData: TokenData;
            provider: BuiltinProviderNames;
          }
        | { tokenData: null; provider: null }
      ) & { isSignUp: boolean }
    >,
  ) => Promise<never>;
  onEmailVerify?: (
    params: ParamsOrError<
      { tokenData: TokenData },
      { verificationToken?: string }
    >,
  ) => Promise<never>;
  onMagicLinkCallback?: (
    params: ParamsOrError<{
      tokenData: TokenData;
      isSignUp: boolean;
    }>,
  ) => Promise<Response>;
  onSignout?: () => Promise<never>;
}

const noMatchingRoute = Symbol();

export default function serverAuth(client: Client, options: AuthOptions) {
  const core = Auth.create(client);
  const config = getConfig(options);

  return {
    createServerRequestAuth: (event: RequestEvent) =>
      new ServerRequestAuth(client, core, event, options),
    createAuthRouteHook:
      (handlers: AuthRouteHandlers): Handle =>
      async ({ event, resolve }) => {
        const pathname = event.url.pathname;

        if (pathname.startsWith(`/${config.authRoutesPath}/`)) {
          if (
            (await handleAuthRoutes(handlers, event, core, config)) !==
            noMatchingRoute
          ) {
            throw new BackendError(
              "Auth route handler should always call redirect().",
            );
          }
        }

        return resolve(event);
      },
  };
}

const BASE_COOKIE_CONFIG: {
  httpOnly: boolean;
  sameSite: boolean | "lax" | "strict" | "none" | undefined;
  path: string;
} = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
};

function setVerifierCookie(
  cookies: Cookies,
  config: AuthConfig,
  value: string,
): void {
  const expires = new Date(Date.now() + 1000 * 60 * 24 * 7); // in 7 days
  cookies.set(config.pkceVerifierCookieName, value, {
    ...BASE_COOKIE_CONFIG,
    expires,
    secure: config.baseUrl.startsWith("https"),
  });
}

function setAuthCookie(
  cookies: Cookies,
  config: AuthConfig,
  value: string,
): void {
  cookies.set(config.authCookieName, value, {
    ...BASE_COOKIE_CONFIG,
    expires: Auth.getTokenExpiration(value) || undefined,
    secure: config.baseUrl.startsWith("https"),
  });
}

function deleteCookie(cookies: Cookies, name: string) {
  cookies.set(name, "", {
    path: "/",
  });
}

export class ServerRequestAuth extends ClientAuth {
  private readonly client: Client;
  private readonly core: Promise<Auth>;
  private readonly cookies: Cookies;
  private _session: AuthSession | undefined;

  private setVerifierCookie(verifier: string) {
    setVerifierCookie(this.cookies, this.config, verifier);
  }

  private setAuthCookie(authToken: string) {
    setAuthCookie(this.cookies, this.config, authToken);
  }

  private deleteVerifierCookie() {
    deleteCookie(this.cookies, this.config.pkceVerifierCookieName);
    deleteCookie(this.cookies, "edgedb-pkce-verifier");
  }

  private deleteAuthCookie() {
    deleteCookie(this.cookies, this.config.authCookieName);
    deleteCookie(this.cookies, "edgedb-session");
  }

  get session() {
    if (!this._session) {
      this._session = new AuthSession(
        this.client,
        this.cookies.get(this.config.authCookieName) ||
          this.cookies.get("edgedb-session"),
      );
    }

    return this._session;
  }

  /** @internal */
  constructor(
    client: Client,
    core: Promise<Auth>,
    { cookies }: RequestEvent,
    options: AuthOptions,
  ) {
    super(options);

    this.client = client;
    this.core = core;
    this.cookies = cookies;
  }

  isPasswordResetTokenValid(resetToken: string) {
    return Auth.checkPasswordResetTokenValid(resetToken);
  }

  async getProvidersInfo() {
    return (await this.core).getProvidersInfo();
  }

  async emailPasswordSignUp(
    data: { email: string; password: string } | FormData,
  ): Promise<{ tokenData?: TokenData | null }> {
    const [email, password] = extractParams(
      data,
      ["email", "password"],
      "email or password missing",
    );

    const result = await (
      await this.core
    ).signupWithEmailPassword(
      email,
      password,
      `${this.config.authRoute}/emailpassword/verify`,
    );

    this.setVerifierCookie(result.verifier);

    if (result.status === "complete") {
      const tokenData = result.tokenData;

      this.setAuthCookie(tokenData.auth_token);

      return { tokenData };
    }

    return { tokenData: null };
  }

  async emailPasswordResendVerificationEmail(
    data: { verification_token: string } | { email: string } | FormData,
  ): Promise<void> {
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
      return await (
        await this.core
      ).resendVerificationEmail(verificationToken.toString());
    } else if (email) {
      const { verifier } = await (
        await this.core
      ).resendVerificationEmailForEmail(
        email.toString(),
        `${this.config.authRoute}/emailpassword/verify`,
      );

      this.setVerifierCookie(verifier);
    } else {
      throw new InvalidDataError(
        "expected 'verification_token' or 'email' in data",
      );
    }
  }

  async emailPasswordSignIn(
    data: { email: string; password: string } | FormData,
  ): Promise<{ tokenData?: TokenData; error?: Error }> {
    const [email, password] = extractParams(
      data,
      ["email", "password"],
      "email or password missing",
    );

    const tokenData = await (
      await this.core
    ).signinWithEmailPassword(email, password);

    this.setAuthCookie(tokenData.auth_token);

    return { tokenData };
  }

  async emailPasswordSendPasswordResetEmail(
    data: { email: string } | FormData,
  ): Promise<void> {
    if (!this.config.passwordResetPath) {
      throw new ConfigurationError(`'passwordResetPath' option not configured`);
    }

    const [email] = extractParams(data, ["email"], "email missing");

    const { verifier } = await (
      await this.core
    ).sendPasswordResetEmail(
      email,
      new URL(this.config.passwordResetPath, this.config.baseUrl).toString(),
    );

    this.setVerifierCookie(verifier);
  }

  async emailPasswordResetPassword(
    data: { reset_token: string; password: string } | FormData,
  ): Promise<{ tokenData: TokenData }> {
    const verifier =
      this.cookies.get(this.config.pkceVerifierCookieName) ||
      this.cookies.get("edgedb-pkce-verifier");

    if (!verifier) {
      throw new PKCEError("no pkce verifier cookie found");
    }

    const [resetToken, password] = extractParams(
      data,
      ["reset_token", "password"],
      "reset_token or password missing",
    );

    const tokenData = await (
      await this.core
    ).resetPasswordWithResetToken(resetToken, verifier, password);

    this.setAuthCookie(tokenData.auth_token);

    this.deleteVerifierCookie();

    return { tokenData };
  }

  async magicLinkSignUp(data: { email: string } | FormData): Promise<void> {
    if (!this.config.magicLinkFailurePath) {
      throw new ConfigurationError(
        `'magicLinkFailurePath' option not configured`,
      );
    }
    const [email] = extractParams(data, ["email"], "email missing");

    const { verifier } = await (
      await this.core
    ).signupWithMagicLink(
      email,
      `${this.config.authRoute}/magiclink/callback?isSignUp=true`,
      new URL(this.config.magicLinkFailurePath, this.config.baseUrl).toString(),
    );

    this.setVerifierCookie(verifier);
  }

  async magicLinkSend(data: { email: string } | FormData): Promise<void> {
    if (!this.config.magicLinkFailurePath) {
      throw new ConfigurationError(
        `'magicLinkFailurePath' option not configured`,
      );
    }
    const [email] = extractParams(data, ["email"], "email missing");

    const { verifier } = await (
      await this.core
    ).signinWithMagicLink(
      email,
      `${this.config.authRoute}/magiclink/callback?isSignUp=true`,
      new URL(this.config.magicLinkFailurePath, this.config.baseUrl).toString(),
    );

    this.setVerifierCookie(verifier);
  }

  async webAuthnSignIn(data: {
    email: string;
    assertion: AuthenticationResponseJSON;
  }): Promise<{ tokenData: TokenData }> {
    const { email, assertion } = data;

    const tokenData = await (
      await this.core
    ).signinWithWebAuthn(email, assertion);

    this.setAuthCookie(tokenData.auth_token);

    return { tokenData };
  }

  async webAuthnSignUp(data: {
    email: string;
    credentials: RegistrationResponseJSON;
    verify_url: string;
    user_handle: string;
  }): Promise<{ tokenData: TokenData | null }> {
    const { email, credentials, verify_url, user_handle } = data;

    const result = await (
      await this.core
    ).signupWithWebAuthn(email, credentials, verify_url, user_handle);

    this.setVerifierCookie(result.verifier);

    if (result.status === "complete") {
      const tokenData = result.tokenData;

      this.setAuthCookie(tokenData.auth_token);

      return { tokenData };
    }

    return { tokenData: null };
  }

  async signout(): Promise<void> {
    this.deleteAuthCookie();
  }
}

export class AuthSession {
  public readonly client: Client;

  /** @internal */
  constructor(
    client: Client,
    private readonly authToken: string | undefined,
  ) {
    this.client = this.authToken
      ? client.withGlobals({ "ext::auth::client_token": this.authToken })
      : client;
  }

  async isSignedIn() {
    if (!this.authToken) return false;
    try {
      return await this.client.querySingle<boolean>(
        `select exists global ext::auth::ClientTokenIdentity`,
      );
    } catch {
      return false;
    }
  }
}

function extractParams(
  data: FormData | Record<string, unknown>,
  paramNames: string[],
  errMessage: string,
) {
  const params: string[] = [];
  if (data instanceof FormData) {
    for (const paramName of paramNames) {
      const param = data.get(paramName)?.toString();
      if (!param) {
        throw new InvalidDataError(errMessage);
      }
      params.push(param);
    }
  } else {
    if (typeof data !== "object") {
      throw new InvalidDataError("expected json object");
    }
    for (const paramName of paramNames) {
      const param = data[paramName];
      if (!param) {
        throw new InvalidDataError(errMessage);
      }
      if (typeof param !== "string") {
        throw new InvalidDataError(`expected '${paramName}' to be a string`);
      }
      params.push(param);
    }
  }

  return params;
}

async function handleAuthRoutes(
  {
    onOAuthCallback,
    onBuiltinUICallback,
    onEmailVerify,
    onMagicLinkCallback,
    onSignout,
  }: AuthRouteHandlers,
  { url, cookies }: RequestEvent,
  core: Promise<Auth>,
  config: AuthConfig,
) {
  const searchParams = url.searchParams;
  const path = url.pathname.split("/").slice(2).join("/");

  function deleteVerifierCookie() {
    deleteCookie(cookies, config.pkceVerifierCookieName);
    deleteCookie(cookies, "edgedb-pkce-verifier");
  }

  function getVerifierCookie() {
    return (
      cookies.get(config.pkceVerifierCookieName) ||
      cookies.get("edgedb-pkce-verifier")
    );
  }

  switch (path) {
    case "oauth": {
      if (!onOAuthCallback) {
        throw new ConfigurationError(
          `'onOAuthCallback' auth route handler not configured`,
        );
      }
      const provider = searchParams.get(
        "provider_name",
      ) as BuiltinOAuthProviderNames | null;
      if (!provider || !builtinOAuthProviderNames.includes(provider)) {
        throw new InvalidDataError(`invalid provider_name: ${provider}`);
      }
      const redirectUrl = `${config.authRoute}/oauth/callback`;
      const pkceSession = await core.then((core) => core.createPKCESession());

      setVerifierCookie(cookies, config, pkceSession.verifier);

      return redirect(
        307,
        pkceSession.getOAuthUrl(
          provider,
          redirectUrl,
          `${redirectUrl}?isSignUp=true`,
        ),
      );
    }

    case "oauth/callback": {
      if (!onOAuthCallback) {
        throw new ConfigurationError(
          `'onOAuthCallback' auth route handler not configured`,
        );
      }
      const error = searchParams.get("error");
      if (error) {
        const desc = searchParams.get("error_description");
        return onOAuthCallback({
          error: new OAuthProviderFailureError(
            error + (desc ? `: ${desc}` : ""),
          ),
        });
      }
      const code = searchParams.get("code");
      const isSignUp = searchParams.get("isSignUp") === "true";
      const verifier = getVerifierCookie();
      if (!code) {
        return onOAuthCallback({
          error: new PKCEError("no pkce code in response"),
        });
      }
      if (!verifier) {
        return onOAuthCallback({
          error: new PKCEError("no pkce verifier cookie found"),
        });
      }
      let tokenData: TokenData;
      try {
        tokenData = await (await core).getToken(code, verifier);
      } catch (err) {
        return onOAuthCallback({
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }

      setAuthCookie(cookies, config, tokenData.auth_token);

      deleteVerifierCookie();

      return onOAuthCallback({
        error: null,
        tokenData,
        provider: searchParams.get("provider") as BuiltinOAuthProviderNames,
        isSignUp,
      });
    }

    case "builtin/callback": {
      if (!onBuiltinUICallback) {
        throw new ConfigurationError(
          `'onBuiltinUICallback' auth route handler not configured`,
        );
      }
      const error = searchParams.get("error");
      if (error) {
        const desc = searchParams.get("error_description");
        return onBuiltinUICallback({
          error: new GelAuthError(error + (desc ? `: ${desc}` : "")),
        });
      }
      const code = searchParams.get("code");
      const verificationEmailSentAt = searchParams.get(
        "verification_email_sent_at",
      );
      if (!code) {
        if (verificationEmailSentAt) {
          return onBuiltinUICallback({
            error: null,
            tokenData: null,
            provider: null,
            isSignUp: true,
          });
        }
        return onBuiltinUICallback({
          error: new PKCEError("no pkce code in response"),
        });
      }
      const verifier = getVerifierCookie();

      if (!verifier) {
        return onBuiltinUICallback({
          error: new PKCEError("no pkce verifier cookie found"),
        });
      }
      const isSignUp = searchParams.get("isSignUp") === "true";
      let tokenData: TokenData;
      try {
        tokenData = await (await core).getToken(code, verifier);
      } catch (err) {
        return onBuiltinUICallback({
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }

      setAuthCookie(cookies, config, tokenData.auth_token);

      // n.b. we need to keep the verifier cookie around for the email
      // verification flow which uses the same PKCE session

      return onBuiltinUICallback({
        error: null,
        tokenData,
        provider: searchParams.get("provider") as BuiltinProviderNames,
        isSignUp,
      });
    }

    case "builtin/signin":
    case "builtin/signup": {
      const pkceSession = await core.then((core) => core.createPKCESession());

      const { verifier } = pkceSession;
      setVerifierCookie(cookies, config, verifier);

      return redirect(
        307,
        path.split("/").pop() === "signup"
          ? pkceSession.getHostedUISignupUrl()
          : pkceSession.getHostedUISigninUrl(),
      );
    }

    case "emailpassword/verify": {
      if (!onEmailVerify) {
        throw new ConfigurationError(
          `'onEmailVerify' auth route handler not configured`,
        );
      }
      const verificationToken = searchParams.get("verification_token");
      const verifier = getVerifierCookie();
      if (!verificationToken) {
        return onEmailVerify({
          error: new PKCEError("no verification_token in response"),
        });
      }
      if (!verifier) {
        return onEmailVerify({
          error: new PKCEError("no pkce verifier cookie found"),
          verificationToken,
        });
      }
      let tokenData: TokenData;
      try {
        tokenData = await (
          await core
        ).verifyEmailPasswordSignup(verificationToken, verifier);
      } catch (err) {
        return onEmailVerify({
          error: err instanceof Error ? err : new Error(String(err)),
          verificationToken,
        });
      }

      setAuthCookie(cookies, config, tokenData.auth_token);

      deleteVerifierCookie();

      return onEmailVerify({
        error: null,
        tokenData,
      });
    }

    case "magiclink/callback": {
      if (!onMagicLinkCallback) {
        throw new ConfigurationError(
          `'onMagicLinkCallback' auth route handler not configured`,
        );
      }

      const error = searchParams.get("error");
      if (error) {
        const desc = searchParams.get("error_description");
        return onMagicLinkCallback({
          error: new MagicLinkFailureError(error + (desc ? `: ${desc}` : "")),
        });
      }

      const code = searchParams.get("code");
      const isSignUp = searchParams.get("isSignUp") === "true";
      const verifier = getVerifierCookie();
      if (!code) {
        return onMagicLinkCallback({
          error: new PKCEError("no pkce code in response"),
        });
      }

      if (!verifier) {
        return onMagicLinkCallback({
          error: new PKCEError("no pkce verifier cookie found"),
        });
      }

      let tokenData: TokenData;
      try {
        tokenData = await (await core).getToken(code, verifier);
      } catch (err) {
        return onMagicLinkCallback({
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }

      setAuthCookie(cookies, config, tokenData.auth_token);

      deleteVerifierCookie();

      return onMagicLinkCallback({
        error: null,
        tokenData,
        isSignUp,
      });
    }

    case "webauthn/signup/options": {
      const email = searchParams.get("email");
      if (!email) {
        throw new InvalidDataError("email missing");
      }

      return redirect(307, (await core).getWebAuthnSignupOptionsUrl(email));
    }

    case "webauthn/signin/options": {
      const email = searchParams.get("email");
      if (!email) {
        throw new InvalidDataError("email missing");
      }

      return redirect(307, (await core).getWebAuthnSigninOptionsUrl(email));
    }

    case "webauthn/verify": {
      if (!onEmailVerify) {
        throw new ConfigurationError(
          `'onEmailVerify' auth route handler not configured`,
        );
      }
      const verificationToken = searchParams.get("verification_token");
      const verifier = getVerifierCookie();
      if (!verificationToken) {
        return onEmailVerify({
          error: new PKCEError("no verification_token in response"),
        });
      }
      if (!verifier) {
        return onEmailVerify({
          error: new PKCEError("no pkce verifier cookie found"),
          verificationToken,
        });
      }
      let tokenData: TokenData;
      try {
        tokenData = await (
          await core
        ).verifyWebAuthnSignup(verificationToken, verifier);
      } catch (err) {
        return onEmailVerify({
          error: err instanceof Error ? err : new Error(String(err)),
          verificationToken,
        });
      }

      setAuthCookie(cookies, config, tokenData.auth_token);

      deleteVerifierCookie();

      return onEmailVerify({
        error: null,
        tokenData,
      });
    }

    case "signout": {
      if (!onSignout) {
        throw new ConfigurationError(
          `'onSignout' auth route handler not configured`,
        );
      }

      deleteCookie(cookies, config.authCookieName);
      deleteCookie(cookies, "edgedb-session");

      return onSignout();
    }

    default:
      return noMatchingRoute;
  }
}
