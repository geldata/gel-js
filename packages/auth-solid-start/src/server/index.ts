import {
  Auth,
  BuiltinOAuthProviderNames,
  builtinOAuthProviderNames,
  ConfigurationError,
  EdgeDBAuthError,
  InvalidDataError,
  OAuthProviderFailureError,
  PKCEError,
  SignupResponse,
  type TokenData,
} from "@edgedb/auth-core";
import { type APIEvent } from "@solidjs/start/server";
import type { Client } from "edgedb";
import { deleteCookie, getCookie, HTTPEvent, setCookie } from "vinxi/http";
import {
  BuiltinProviderNames,
  SolidAuthHelpers,
  SolidAuthOptions,
} from "../shared";

export * from "@edgedb/auth-core/errors";
export { SolidAuthHelpers };
export type { BuiltinProviderNames, SolidAuthOptions, TokenData };

type ParamsOrError<
  Result extends object,
  ErrorDetails extends object = object,
> =
  | ({ error: null } & { [Key in keyof ErrorDetails]?: undefined } & Result)
  | ({ error: Error } & ErrorDetails & { [Key in keyof Result]?: undefined });

export class SolidAuthSession {
  public readonly client: Client;

  /** @internal */
  constructor(
    client: Client,
    public readonly authToken: string | null,
  ) {
    this.client = this.authToken
      ? client.withGlobals({ "ext::auth::client_token": this.authToken })
      : client;
  }

  private _isSignedIn: Promise<boolean> | null = null;
  async isSignedIn(): Promise<boolean> {
    if (!this.authToken) return false;
    return (
      this._isSignedIn ??
      (this._isSignedIn = this.client
        .queryRequiredSingle<boolean>(
          `select exists global ext::auth::ClientTokenIdentity`,
        )
        .catch(() => false))
    );
  }
}

export interface CreateAuthRouteHandlers {
  onOAuthCallback(
    params: ParamsOrError<{
      tokenData: TokenData;
      provider: BuiltinOAuthProviderNames;
      isSignUp: boolean;
    }>,
  ): Promise<Response>;
  onEmailPasswordSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
  ): Promise<Response>;
  onEmailPasswordSignUp(
    params: ParamsOrError<{ tokenData: TokenData | null }>,
  ): Promise<Response>;
  onEmailPasswordReset(
    params: ParamsOrError<{ tokenData: TokenData }>,
  ): Promise<Response>;
  onEmailVerify(
    params: ParamsOrError<
      { tokenData: TokenData },
      { verificationToken?: string }
    >,
  ): Promise<Response>;
  onWebAuthnSignUp(
    params: ParamsOrError<{ tokenData: TokenData | null }>,
  ): Promise<Response>;
  onWebAuthnSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
  ): Promise<Response>;
  onMagicLinkCallback(
    params: ParamsOrError<{ tokenData: TokenData; isSignUp: boolean }>,
  ): Promise<Response>;
  onMagicLinkSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
  ): Promise<Response>;
  onBuiltinUICallback(
    params: ParamsOrError<
      (
        | {
            tokenData: TokenData;
            provider: BuiltinProviderNames;
          }
        | {
            tokenData: null;
            provider: null;
          }
      ) & { isSignUp: boolean }
    >,
  ): Promise<Response>;
  onSignout(evt: APIEvent): Promise<Response>;
}

export class SolidServerAuth extends SolidAuthHelpers {
  protected readonly core: Promise<Auth>;

  /** @internal */
  constructor(
    protected readonly client: Client,
    options: SolidAuthOptions,
  ) {
    super(options);
    this.client = client;
    this.core = Auth.create(client);
  }

  async getProvidersInfo() {
    return (await this.core).getProvidersInfo();
  }

  isPasswordResetTokenValid(resetToken: string) {
    return Auth.checkPasswordResetTokenValid(resetToken);
  }

  setVerifierCookie(verifier: string) {
    setCookie(this.options.pkceVerifierCookieName, verifier, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.isSecure,
      maxAge: 60 * 60 * 24 * 7, // In 7 days
    });
  }

  setAuthCookie(token: string) {
    const expirationDate = Auth.getTokenExpiration(token);
    setCookie(this.options.authCookieName, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.isSecure,
      expires: expirationDate ?? undefined,
    });
  }

  createAuthRouteHandlers({
    onOAuthCallback,
    onEmailPasswordSignIn,
    onEmailPasswordSignUp,
    onEmailPasswordReset,
    onEmailVerify,
    onWebAuthnSignUp,
    onWebAuthnSignIn,
    onMagicLinkCallback,
    onBuiltinUICallback,
    onSignout,
  }: Partial<CreateAuthRouteHandlers>) {
    return {
      GET: async (evt: APIEvent) => {
        const req = evt.request;
        const reqURL = new URL(req.url);
        const verifier = this.getPkceVirefierCookie();
        const verificationToken = reqURL.searchParams.get("verification_token");
        switch (evt.params.auth) {
          case "oauth": {
            if (!onOAuthCallback) {
              throw new ConfigurationError(
                `'onOAuthCallback' auth route handler not configured`,
              );
            }
            const provider = reqURL.searchParams.get(
              "provider_name",
            ) as BuiltinOAuthProviderNames | null;
            if (!provider || !builtinOAuthProviderNames.includes(provider)) {
              throw new InvalidDataError(`invalid provider_name: ${provider}`);
            }
            const redirectUrl = `${this._authRoute}/oauth/callback`;
            const pkceSession = await this.core.then((core) =>
              core.createPKCESession(),
            );
            this.setVerifierCookie(pkceSession.verifier);
            return _redirect(
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
            const error = reqURL.searchParams.get("error");
            if (error) {
              const desc = reqURL.searchParams.get("error_description");
              return onOAuthCallback({
                error: new OAuthProviderFailureError(
                  error + (desc ? `: ${desc}` : ""),
                ),
              });
            }
            const code = reqURL.searchParams.get("code");
            const isSignUp = reqURL.searchParams.get("isSignUp") === "true";

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
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onOAuthCallback({
                error: err instanceof Error ? err : new Error(String(err)),
              });
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();

            return onOAuthCallback({
              error: null,
              tokenData,
              provider: reqURL.searchParams.get(
                "provider",
              ) as BuiltinOAuthProviderNames,
              isSignUp,
            });
          }
          case "emailpassword/verify": {
            if (!onEmailVerify) {
              throw new ConfigurationError(
                `'onEmailVerify' auth route handler not configured`,
              );
            }

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
                await this.core
              ).verifyEmailPasswordSignup(verificationToken, verifier);
            } catch (err) {
              return onEmailVerify({
                error: err instanceof Error ? err : new Error(String(err)),
                verificationToken,
              });
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();

            return onEmailVerify({ error: null, tokenData });
          }
          case "webauthn/signup/options": {
            const email = reqURL.searchParams.get("email");
            if (!email) {
              throw new InvalidDataError(
                "'email' is missing in request search parameters",
              );
            }
            return _redirect(
              (await this.core).getWebAuthnSignupOptionsUrl(email),
            );
          }
          case "webauthn/signin/options": {
            const email = reqURL.searchParams.get("email");
            if (!email) {
              throw new InvalidDataError(
                "'email' is missing in request search parameters",
              );
            }
            return _redirect(
              (await this.core).getWebAuthnSigninOptionsUrl(email),
            );
          }
          case "webauthn/verify": {
            if (!onEmailVerify) {
              throw new ConfigurationError(
                `'onEmailVerify' auth route handler not configured`,
              );
            }
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
                await this.core
              ).verifyWebAuthnSignup(verificationToken, verifier);
            } catch (err) {
              return onEmailVerify({
                error: err instanceof Error ? err : new Error(String(err)),
                verificationToken,
              });
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();

            return onEmailVerify({ error: null, tokenData });
          }
          case "magiclink/callback": {
            if (!onMagicLinkCallback) {
              throw new ConfigurationError(
                `'onMagicLinkCallback' auth route handler not configured`,
              );
            }
            const error = reqURL.searchParams.get("error");
            if (error) {
              const desc = reqURL.searchParams.get("error_description");
              return onMagicLinkCallback({
                error: new OAuthProviderFailureError(
                  error + (desc ? `: ${desc}` : ""),
                ),
              });
            }
            const code = reqURL.searchParams.get("code");
            const isSignUp = reqURL.searchParams.get("isSignUp") === "true";
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
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onMagicLinkCallback({
                error: err instanceof Error ? err : new Error(String(err)),
              });
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();

            return onMagicLinkCallback({
              error: null,
              tokenData,
              isSignUp,
            });
          }
          case "builtin/callback": {
            if (!onBuiltinUICallback) {
              throw new ConfigurationError(
                `'onBuiltinUICallback' auth route handler not configured`,
              );
            }
            const error = reqURL.searchParams.get("error");
            if (error) {
              const desc = reqURL.searchParams.get("error_description");

              return onBuiltinUICallback({
                error: new Error(error + (desc ? `: ${desc}` : "")),
              });
            }
            const code = reqURL.searchParams.get("code");
            const verificationEmailSentAt = reqURL.searchParams.get(
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
            if (!verifier) {
              return onBuiltinUICallback({
                error: new PKCEError("no pkce verifier cookie found"),
              });
            }
            const isSignUp = reqURL.searchParams.get("isSignUp") === "true";
            let tokenData: TokenData;
            try {
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onBuiltinUICallback({
                error: err instanceof Error ? err : new Error(String(err)),
              });
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();

            return onBuiltinUICallback({
              error: null,
              tokenData,
              provider: reqURL.searchParams.get(
                "provider",
              ) as BuiltinProviderNames,
              isSignUp,
            });
          }
          case "builtin/signin":
          case "builtin/signup": {
            const pkceSession = await this.core.then((core) =>
              core.createPKCESession(),
            );
            this.setVerifierCookie(pkceSession.verifier);

            return _redirect(
              evt.params.auth === "builtin/signup"
                ? pkceSession.getHostedUISignupUrl()
                : pkceSession.getHostedUISigninUrl(),
            );
          }
          case "signout": {
            if (!onSignout) {
              throw new ConfigurationError(
                `'onSignout' auth route handler not configured`,
              );
            }
            deleteCookie(this.options.authCookieName);
            return onSignout(evt);
          }
          default:
            return new Response("Unknown auth route", {
              status: 404,
            });
        }
      },
      POST: async (
        evt: APIEvent & {
          params: { auth: string };
        },
      ) => {
        const req = evt.request;
        const verifier = this.getPkceVirefierCookie();
        switch (evt.params.auth) {
          case "emailpassword/signin": {
            const data = await _getReqBody(req);
            if (!onEmailPasswordSignIn) {
              throw new ConfigurationError(
                `'onEmailPasswordSignIn' auth route handler not configured`,
              );
            }
            let tokenData: TokenData;
            try {
              const [email, password] = _extractParams(
                data,
                ["email", "password"],
                "email or password missing from request body",
              );
              tokenData = await (
                await this.core
              ).signinWithEmailPassword(email, password);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return onEmailPasswordSignIn
                ? onEmailPasswordSignIn({ error })
                : Response.json(_wrapError(error));
            }
            this.setAuthCookie(tokenData.auth_token);
            return onEmailPasswordSignIn?.({ error: null, tokenData });
          }
          case "emailpassword/signup": {
            const data = await _getReqBody(req);
            if (!onEmailPasswordSignUp) {
              throw new ConfigurationError(
                `'onEmailPasswordSignUp' auth route handler not configured`,
              );
            }
            let result: Awaited<
              ReturnType<Awaited<typeof this.core>["signupWithEmailPassword"]>
            >;
            try {
              const [email, password] = _extractParams(
                data,
                ["email", "password"],
                "email or password missing from request body",
              );
              result = await (
                await this.core
              ).signupWithEmailPassword(
                email,
                password,
                `${this._authRoute}/emailpassword/verify`,
              );
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return onEmailPasswordSignUp
                ? onEmailPasswordSignUp({ error })
                : Response.json(_wrapError(error));
            }
            this.setVerifierCookie(result.verifier);
            if (result.status === "complete") {
              this.setAuthCookie(result.tokenData.auth_token);
              return onEmailPasswordSignUp?.({
                error: null,
                tokenData: result.tokenData,
              });
            } else {
              return onEmailPasswordSignUp?.({ error: null, tokenData: null });
            }
          }
          case "emailpassword/send-reset-email": {
            if (!this.options.passwordResetPath) {
              throw new ConfigurationError(
                `'passwordResetPath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const [email] = _extractParams(
              data,
              ["email"],
              "email missing from request body",
            );
            const { verifier } = await (
              await this.core
            ).sendPasswordResetEmail(
              email,
              new URL(
                this.options.passwordResetPath,
                this.options.baseUrl,
              ).toString(),
            );
            this.setVerifierCookie(verifier);
            return Response.json({ _data: null });
          }
          case "emailpassword/reset-password": {
            const data = await _getReqBody(req);
            if (!onEmailPasswordReset) {
              throw new ConfigurationError(
                `'onEmailPasswordReset' auth route handler not configured`,
              );
            }
            let tokenData: TokenData;
            try {
              if (!verifier) {
                throw new PKCEError("no pkce verifier cookie found");
              }
              const [resetToken, password] = _extractParams(
                data,
                ["reset_token", "password"],
                "reset_token or password missing from request body",
              );

              tokenData = await (
                await this.core
              ).resetPasswordWithResetToken(resetToken, verifier, password);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return onEmailPasswordReset
                ? onEmailPasswordReset({ error })
                : Response.json(_wrapError(error));
            }
            this.setAuthCookie(tokenData.auth_token);
            this.deletePkceVerifierCookie();
            return onEmailPasswordReset?.({ error: null, tokenData });
          }
          case "emailpassword/resend-verification-email": {
            const data = await _getReqBody(req);
            const verificationToken =
              data instanceof FormData
                ? data.get("verification_token")?.toString()
                : data.verification_token;
            const email =
              data instanceof FormData
                ? data.get("email")?.toString()
                : data.email;

            if (verificationToken) {
              await (
                await this.core
              ).resendVerificationEmail(verificationToken.toString());
              return Response.json({ _data: null });
            } else if (email) {
              const { verifier } = await (
                await this.core
              ).resendVerificationEmailForEmail(
                email.toString(),
                `${this._authRoute}/emailpassword/verify`,
              );
              setCookie(this.options.pkceVerifierCookieName, verifier, {
                httpOnly: true,
                sameSite: "strict",
                path: "/",
              });
              return Response.json({ _data: null });
            } else {
              throw new InvalidDataError(
                "verification_token or email missing from request body",
              );
            }
          }
          case "webauthn/signup": {
            if (!onWebAuthnSignUp) {
              throw new ConfigurationError(
                `'onWebAuthnSignUp' auth route handler not configured`,
              );
            }
            // @ts-expect-error
            const { email, credentials, verify_url, user_handle } =
              await req.json();

            let result: SignupResponse;
            try {
              result = await (
                await this.core
              ).signupWithWebAuthn(email, credentials, verify_url, user_handle);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return onWebAuthnSignUp({ error });
            }

            this.setVerifierCookie(result.verifier);
            if (result.status === "complete") {
              this.setAuthCookie(result.tokenData.auth_token);
              return onWebAuthnSignUp({
                error: null,
                tokenData: result.tokenData,
              });
            } else {
              return onWebAuthnSignUp({ error: null, tokenData: null }), false;
            }
          }
          case "webauthn/signin": {
            if (!onWebAuthnSignIn) {
              throw new ConfigurationError(
                `'onWebAuthnSignIn' auth route handler not configured`,
              );
            }
            // @ts-expect-error
            const { email, assertion } = await req.json();

            let tokenData: TokenData;
            try {
              tokenData = await (
                await this.core
              ).signinWithWebAuthn(email, assertion);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return onWebAuthnSignIn({ error });
            }
            this.setAuthCookie(tokenData.auth_token);
            return onWebAuthnSignIn({ error: null, tokenData });
          }
          case "magiclink/signup": {
            if (!this.options.magicLinkFailurePath) {
              throw new ConfigurationError(
                `'magicLinkFailurePath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const [email] = _extractParams(
              data,
              ["email"],
              "email missing from request body",
            );
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
            this.setVerifierCookie(verifier);
            return Response.json({ _data: null });
          }
          case "magiclink/send": {
            if (!this.options.magicLinkFailurePath) {
              throw new ConfigurationError(
                `'magicLinkFailurePath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const [email] = _extractParams(
              data,
              ["email"],
              "email missing from request body",
            );
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
            this.setVerifierCookie(verifier);
            return Response.json({ _data: null });
          }
          default:
            return new Response("Unknown auth route", {
              status: 404,
            });
        }
      },
    };
  }

  getSession = ({
    event,
    token,
  }: {
    event?: HTTPEvent;
  } & { token?: string } = {}) => {
    const authToken =
      token ??
      (event
        ? getCookie(event, this.options.authCookieName)
        : getCookie(this.options.authCookieName)) ??
      null;

    return new SolidAuthSession(this.client, authToken);
  };

  createServerActions() {
    return {
      signout: async () => {
        deleteCookie(this.options.authCookieName);
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
        this.setAuthCookie(tokenData.auth_token);
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
        this.setVerifierCookie(result.verifier);
        if (result.status === "complete") {
          this.setAuthCookie(result.tokenData.auth_token);
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
        this.setVerifierCookie(verifier);
      },
      emailPasswordResetPassword: async (
        data: FormData | { reset_token: string; password: string },
      ) => {
        const verifier = getCookie(this.options.pkceVerifierCookieName);
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
        this.setAuthCookie(tokenData.auth_token);
        deleteCookie(this.options.pkceVerifierCookieName);
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

          setCookie(this.options.pkceVerifierCookieName, verifier, {
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
        this.setVerifierCookie(verifier);
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
        this.setVerifierCookie(verifier);
      },
    };
  }

  private getPkceVirefierCookie() {
    return getCookie(this.options.pkceVerifierCookieName);
  }

  private deletePkceVerifierCookie() {
    deleteCookie(this.options.pkceVerifierCookieName);
  }
}
export default function createSolidServerAuth(
  client: Client,
  options: SolidAuthOptions,
) {
  return new SolidServerAuth(client, options);
}

function _getReqBody(
  req: Request,
): Promise<FormData | Record<string, unknown>> {
  return req.headers.get("Content-Type") === "application/json"
    ? (req.json() as unknown as Promise<Record<string, unknown>>)
    : req.formData();
}

function _wrapError(err: Error) {
  return {
    _error: {
      type: err instanceof EdgeDBAuthError ? err.type : null,
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

function _extractParams(
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

function _redirect(url: string, statusCode = 302) {
  const headers = new Headers();
  headers.set("Location", url);
  const response = new Response(null, {
    status: statusCode,
    headers: headers,
  });
  return response;
}
