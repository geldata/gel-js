import { type Client } from "gel";
import {
  Auth,
  type BuiltinOAuthProviderNames,
  type TokenData,
  ConfigurationError,
  InvalidDataError,
  PKCEError,
  GelAuthError,
  OAuthProviderFailureError,
  type SignupResponse,
} from "@gel/auth-core";

import {
  type BuiltinProviderNames,
  NextAuthHelpers,
  type NextAuthOptions,
} from "./shared.client";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

export { type BuiltinProviderNames, NextAuthHelpers, type NextAuthOptions };

type ParamsOrError<
  Result extends object,
  ErrorDetails extends object = object,
> =
  | ({ error: null } & { [Key in keyof ErrorDetails]?: undefined } & Result)
  | ({ error: Error } & ErrorDetails & { [Key in keyof Result]?: undefined });

export interface CreateAuthRouteHandlers {
  onOAuthCallback(
    params: ParamsOrError<{
      tokenData: TokenData;
      provider: BuiltinOAuthProviderNames;
      isSignUp: boolean;
    }>,
    req: NextRequest,
  ): Promise<never>;
  onEmailPasswordSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
    req: NextRequest,
  ): Promise<Response>;
  onEmailPasswordSignUp(
    params: ParamsOrError<{ tokenData: TokenData | null }>,
    req: NextRequest,
  ): Promise<Response>;
  onEmailPasswordReset(
    params: ParamsOrError<{ tokenData: TokenData }>,
    req: NextRequest,
  ): Promise<Response>;
  onEmailVerify(
    params: ParamsOrError<
      { tokenData: TokenData },
      { verificationToken?: string }
    >,
    req: NextRequest,
  ): Promise<never>;
  onWebAuthnSignUp(
    params: ParamsOrError<{ tokenData: TokenData | null }>,
    req: NextRequest,
  ): Promise<NextResponse<SignupResponse>>;
  onWebAuthnSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
    req: NextRequest,
  ): Promise<never>;
  onMagicLinkCallback(
    params: ParamsOrError<{ tokenData: TokenData; isSignUp: boolean }>,
    req: NextRequest,
  ): Promise<never>;
  onMagicLinkSignIn(
    params: ParamsOrError<{ tokenData: TokenData }>,
    req: NextRequest,
  ): Promise<never>;
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
    req: NextRequest,
  ): Promise<never>;
  onSignout(req: NextRequest): Promise<never>;
}

export abstract class NextAuth extends NextAuthHelpers {
  protected readonly core: Promise<Auth>;

  /** @internal */
  constructor(
    protected readonly client: Client,
    options: NextAuthOptions,
  ) {
    super(options);
    this.core = Auth.create(client);
  }

  async getProvidersInfo() {
    return (await this.core).getProvidersInfo();
  }

  isPasswordResetTokenValid(resetToken: string) {
    return Auth.checkPasswordResetTokenValid(resetToken);
  }

  async setVerifierCookie(verifier: string) {
    const cookieStore = await cookies();
    cookieStore.set({
      name: this.options.pkceVerifierCookieName,
      value: verifier,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: this.isSecure,
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // In 7 days
    });
  }

  async setAuthCookie(token: string) {
    const cookieStore = await cookies();
    const expirationDate = Auth.getTokenExpiration(token);
    cookieStore.set({
      name: this.options.authCookieName,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: this.isSecure,
      expires: expirationDate ?? undefined,
    });
  }

  async deleteVerifierCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(this.options.pkceVerifierCookieName);
    cookieStore.delete("gel-pkce-verifier");
  }

  async deleteAuthCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(this.options.authCookieName);
    cookieStore.delete("edgedb-session");
  }

  public oAuth = {
    /**
     * Start the OAuth flow by getting the OAuth configuration from the request
     * URL search parameters and redirecting to the auth extension server's
     * authorize endpoint.
     *
     * @param {NextRequest} req The incoming request.
     * @param {string=} req.nextUrl.searchParams.provider_name The name of the
     * OAuth provider to use.
     * @param {string=} req.nextUrl.searchParams.authorize_url The URL to
     * redirect to to start the OAuth flow. If not provided, will default to
     * the auth extension server's authorize endpoint.
     * @param {string=} req.nextUrl.searchParams.callback_url The URL to
     * redirect to within the OAuth flow once the user has authorized the OAuth
     * client.
     */
    handleOAuth: async (req: NextRequest): Promise<NextResponse> => {
      const providerName = req.nextUrl.searchParams.get("provider_name");
      if (!providerName) {
        throw new InvalidDataError("Missing provider_name in request");
      }

      const callbackUrl = req.nextUrl.searchParams.get("callback_url");

      const authBasePath = this._authRoute.endsWith("/")
        ? this._authRoute
        : `${this._authRoute}/`;
      const redirectTo = new URL("oauth/callback", authBasePath);
      const redirectToOnSignup = new URL(redirectTo);
      redirectToOnSignup.searchParams.set("isSignUp", "true");

      const authorizeUrl =
        req.nextUrl.searchParams.get("authorize_url") ??
        new URL("authorize", this.options.baseUrl).toString();

      const pkceSession = await (await this.core).createPKCESession();
      await this.setVerifierCookie(pkceSession.verifier);

      const location = pkceSession.addOAuthParamsToUrl(authorizeUrl, {
        providerName,
        redirectTo: redirectTo.toString(),
        redirectToOnSignup: redirectToOnSignup.toString(),
        ...(callbackUrl ? { callbackUrl } : {}),
      });
      return NextResponse.redirect(location);
    },

    /**
     * When implementing your own OAuth flow, you should call this method in
     * your OAuth authorize route. It will call the auth extension server's
     * authorize endpoint, copying the relevant search parameters from the
     * incoming request to the auth extension server's authorize endpoint.
     *
     * You would pass the URL to the endpoint that calls this method as the
     * `authorize_url` parameter in the call to the endpoint that calls the
     * `handleOAuth` method.
     *
     * @param {NextRequest} req The incoming request.
     * @param {string} req.nextUrl.searchParams.provider_name The name of the
     * OAuth provider to use.
     * @param {string=} req.nextUrl.searchParams.callback_url The URL to
     * redirect to within the OAuth flow once the user has authorized the OAuth
     * client.
     * @param {string} req.nextUrl.searchParams.redirect_to The URL to
     * redirect to after the OAuth flow is complete.
     * @param {string=} req.nextUrl.searchParams.redirect_to_on_signup The URL
     * to redirect to after the OAuth flow is complete if the user is signing
     * up.
     */
    handleAuthorize: async (req: NextRequest): Promise<NextResponse> => {
      const location = await (
        await this.core
      ).handleOAuthAuthorize(req.nextUrl.searchParams);

      return NextResponse.redirect(location);
    },

    /**
     * When implementing your own OAuth flow, you should call this method in
     * your OAuth callback route, which will handle the callback from the
     * Identity Provider containing the authorization code. This method will
     * then call the auth extension server's callback endpoint, passing along
     * the relevant search parameters from the incoming request.
     *
     * You would pass the URL to the endpoint that calls this method as the
     * `callback_url` parameter in th ecall to th eendpoint that calls the
     * `handleOAuth` method.
     *
     * @param {NextRequest} req
     * @returns
     */
    handleCallback: async (req: NextRequest): Promise<NextResponse> => {
      const location = await (
        await this.core
      ).handleOAuthCallback(req.nextUrl.searchParams);

      return NextResponse.redirect(location);
    },
  };

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
      GET: async (
        req: NextRequest,
        ctx: { params: Promise<{ auth: string[] }> },
      ) => {
        const verifier =
          req.cookies.get(this.options.pkceVerifierCookieName)?.value ||
          req.cookies.get("gel-pkce-verifier")?.value;

        const params = await ctx.params;
        switch (params.auth.join("/")) {
          case "oauth": {
            if (!onOAuthCallback) {
              throw new ConfigurationError(
                `'onOAuthCallback' auth route handler not configured`,
              );
            }
            return this.oAuth.handleOAuth(req);
          }
          case "oauth/callback": {
            if (!onOAuthCallback) {
              throw new ConfigurationError(
                `'onOAuthCallback' auth route handler not configured`,
              );
            }
            const error = req.nextUrl.searchParams.get("error");
            if (error) {
              const desc = req.nextUrl.searchParams.get("error_description");
              return onOAuthCallback(
                {
                  error: new OAuthProviderFailureError(
                    error + (desc ? `: ${desc}` : ""),
                  ),
                },
                req,
              );
            }
            const code = req.nextUrl.searchParams.get("code");
            const isSignUp =
              req.nextUrl.searchParams.get("isSignUp") === "true";
            if (!code) {
              return onOAuthCallback(
                {
                  error: new PKCEError("no pkce code in response"),
                },
                req,
              );
            }
            if (!verifier) {
              return onOAuthCallback(
                {
                  error: new PKCEError("no pkce verifier cookie found"),
                },
                req,
              );
            }
            let tokenData: TokenData;
            try {
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onOAuthCallback(
                {
                  error: err instanceof Error ? err : new Error(String(err)),
                },
                req,
              );
            }
            await this.setAuthCookie(tokenData.auth_token);
            await this.deleteVerifierCookie();

            return onOAuthCallback(
              {
                error: null,
                tokenData,
                provider: req.nextUrl.searchParams.get(
                  "provider",
                ) as BuiltinOAuthProviderNames,
                isSignUp,
              },
              req,
            );
          }
          case "emailpassword/verify": {
            if (!onEmailVerify) {
              throw new ConfigurationError(
                `'onEmailVerify' auth route handler not configured`,
              );
            }
            const verificationToken =
              req.nextUrl.searchParams.get("verification_token");
            if (!verificationToken) {
              return onEmailVerify(
                {
                  error: new PKCEError("no verification_token in response"),
                },
                req,
              );
            }
            if (!verifier) {
              return onEmailVerify(
                {
                  error: new PKCEError("no pkce verifier cookie found"),
                  verificationToken,
                },
                req,
              );
            }
            let tokenData: TokenData;
            try {
              tokenData = await (
                await this.core
              ).verifyEmailPasswordSignup(verificationToken, verifier);
            } catch (err) {
              return onEmailVerify(
                {
                  error: err instanceof Error ? err : new Error(String(err)),
                  verificationToken,
                },
                req,
              );
            }
            await this.setAuthCookie(tokenData.auth_token);
            await this.deleteVerifierCookie();

            return onEmailVerify({ error: null, tokenData }, req);
          }
          case "webauthn/signup/options": {
            const email = req.nextUrl.searchParams.get("email");
            if (!email) {
              throw new InvalidDataError(
                "'email' is missing in request search parameters",
              );
            }
            return Response.redirect(
              (await this.core).getWebAuthnSignupOptionsUrl(email),
            );
          }
          case "webauthn/signin/options": {
            const email = req.nextUrl.searchParams.get("email");
            if (!email) {
              throw new InvalidDataError(
                "'email' is missing in request search parameters",
              );
            }
            return Response.redirect(
              (await this.core).getWebAuthnSigninOptionsUrl(email),
            );
          }
          case "webauthn/verify": {
            if (!onEmailVerify) {
              throw new ConfigurationError(
                `'onEmailVerify' auth route handler not configured`,
              );
            }
            const verificationToken =
              req.nextUrl.searchParams.get("verification_token");
            if (!verificationToken) {
              return onEmailVerify(
                {
                  error: new PKCEError("no verification_token in response"),
                },
                req,
              );
            }
            if (!verifier) {
              return onEmailVerify(
                {
                  error: new PKCEError("no pkce verifier cookie found"),
                  verificationToken,
                },
                req,
              );
            }
            let tokenData: TokenData;
            try {
              tokenData = await (
                await this.core
              ).verifyWebAuthnSignup(verificationToken, verifier);
            } catch (err) {
              return onEmailVerify(
                {
                  error: err instanceof Error ? err : new Error(String(err)),
                  verificationToken,
                },
                req,
              );
            }
            await this.setAuthCookie(tokenData.auth_token);
            await this.deleteVerifierCookie();

            return onEmailVerify({ error: null, tokenData }, req);
          }
          case "magiclink/callback": {
            if (!onMagicLinkCallback) {
              throw new ConfigurationError(
                `'onMagicLinkCallback' auth route handler not configured`,
              );
            }
            const error = req.nextUrl.searchParams.get("error");
            if (error) {
              const desc = req.nextUrl.searchParams.get("error_description");
              return onMagicLinkCallback(
                {
                  error: new OAuthProviderFailureError(
                    error + (desc ? `: ${desc}` : ""),
                  ),
                },
                req,
              );
            }
            const code = req.nextUrl.searchParams.get("code");
            const isSignUp =
              req.nextUrl.searchParams.get("isSignUp") === "true";
            if (!code) {
              return onMagicLinkCallback(
                {
                  error: new PKCEError("no pkce code in response"),
                },
                req,
              );
            }
            if (!verifier) {
              return onMagicLinkCallback(
                {
                  error: new PKCEError("no pkce verifier cookie found"),
                },
                req,
              );
            }
            let tokenData: TokenData;
            try {
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onMagicLinkCallback(
                {
                  error: err instanceof Error ? err : new Error(String(err)),
                },
                req,
              );
            }
            await this.setAuthCookie(tokenData.auth_token);
            await this.deleteVerifierCookie();

            return onMagicLinkCallback(
              {
                error: null,
                tokenData,
                isSignUp,
              },
              req,
            );
          }
          case "builtin/callback": {
            if (!onBuiltinUICallback) {
              throw new ConfigurationError(
                `'onBuiltinUICallback' auth route handler not configured`,
              );
            }
            const error = req.nextUrl.searchParams.get("error");
            if (error) {
              const desc = req.nextUrl.searchParams.get("error_description");
              return onBuiltinUICallback(
                {
                  error: new GelAuthError(error + (desc ? `: ${desc}` : "")),
                },
                req,
              );
            }
            const code = req.nextUrl.searchParams.get("code");
            const verificationEmailSentAt = req.nextUrl.searchParams.get(
              "verification_email_sent_at",
            );

            if (!code) {
              if (verificationEmailSentAt) {
                return onBuiltinUICallback(
                  {
                    error: null,
                    tokenData: null,
                    provider: null,
                    isSignUp: true,
                  },
                  req,
                );
              }
              return onBuiltinUICallback(
                {
                  error: new PKCEError("no pkce code in response"),
                },
                req,
              );
            }
            if (!verifier) {
              return onBuiltinUICallback(
                {
                  error: new PKCEError("no pkce verifier cookie found"),
                },
                req,
              );
            }
            const isSignUp =
              req.nextUrl.searchParams.get("isSignUp") === "true";
            let tokenData: TokenData;
            try {
              tokenData = await (await this.core).getToken(code, verifier);
            } catch (err) {
              return onBuiltinUICallback(
                {
                  error: err instanceof Error ? err : new Error(String(err)),
                },
                req,
              );
            }
            await this.setAuthCookie(tokenData.auth_token);
            // n.b. we need to keep the verifier cookie around for the email
            // verification flow which uses the same PKCE session

            return onBuiltinUICallback(
              {
                error: null,
                tokenData,
                provider: req.nextUrl.searchParams.get(
                  "provider",
                ) as BuiltinProviderNames,
                isSignUp,
              },
              req,
            );
          }
          case "builtin/signin":
          case "builtin/signup": {
            const pkceSession = await this.core.then((core) =>
              core.createPKCESession(),
            );
            await this.setVerifierCookie(pkceSession.verifier);
            return redirect(
              params.auth[params.auth.length - 1] === "signup"
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
            this.deleteAuthCookie();
            return onSignout(req);
          }
          default:
            return new Response("Unknown auth route", {
              status: 404,
            });
        }
      },
      POST: async (
        req: NextRequest,
        ctx: { params: Promise<{ auth: string[] }> },
      ) => {
        const params = await ctx.params;
        switch (params.auth.join("/")) {
          case "emailpassword/signin": {
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
            if (!isAction && !onEmailPasswordSignIn) {
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
                ? _wrapResponse(onEmailPasswordSignIn({ error }, req), isAction)
                : Response.json(_wrapError(error));
            }
            await this.setAuthCookie(tokenData.auth_token);
            return _wrapResponse(
              onEmailPasswordSignIn?.({ error: null, tokenData }, req),
              isAction,
            );
          }
          case "emailpassword/signup": {
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
            if (!isAction && !onEmailPasswordSignUp) {
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
                ? _wrapResponse(onEmailPasswordSignUp({ error }, req), isAction)
                : Response.json(_wrapError(error));
            }
            await this.setVerifierCookie(result.verifier);
            if (result.status === "complete") {
              await this.setAuthCookie(result.tokenData.auth_token);
              return _wrapResponse(
                onEmailPasswordSignUp?.(
                  {
                    error: null,
                    tokenData: result.tokenData,
                  },
                  req,
                ),
                isAction,
              );
            } else {
              return _wrapResponse(
                onEmailPasswordSignUp?.({ error: null, tokenData: null }, req),
                isAction,
              );
            }
          }
          case "emailpassword/send-reset-email": {
            if (!this.options.passwordResetPath) {
              throw new ConfigurationError(
                `'passwordResetPath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
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
            await this.setVerifierCookie(verifier);
            return isAction
              ? Response.json({ _data: null })
              : new Response(null, { status: 204 });
          }
          case "emailpassword/reset-password": {
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
            if (!isAction && !onEmailPasswordReset) {
              throw new ConfigurationError(
                `'onEmailPasswordReset' auth route handler not configured`,
              );
            }
            let tokenData: TokenData;
            try {
              const verifier =
                req.cookies.get(this.options.pkceVerifierCookieName)?.value ||
                req.cookies.get("gel-pkce-verifier")?.value;
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
                ? _wrapResponse(onEmailPasswordReset({ error }, req), isAction)
                : Response.json(_wrapError(error));
            }
            await this.setAuthCookie(tokenData.auth_token);
            await this.deleteVerifierCookie();
            return _wrapResponse(
              onEmailPasswordReset?.({ error: null, tokenData }, req),
              isAction,
            );
          }
          case "emailpassword/resend-verification-email": {
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
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
              return isAction
                ? Response.json({ _data: null })
                : new Response(null, { status: 204 });
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
                path: "/",
              });
              return isAction
                ? Response.json({ _data: null })
                : new Response(null, { status: 204 });
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

            const { email, credentials, verify_url, user_handle } =
              await req.json();

            let result: SignupResponse;
            try {
              result = await (
                await this.core
              ).signupWithWebAuthn(email, credentials, verify_url, user_handle);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return _wrapResponse(onWebAuthnSignUp({ error }, req), false);
            }

            await this.setVerifierCookie(result.verifier);
            if (result.status === "complete") {
              await this.setAuthCookie(result.tokenData.auth_token);
              return _wrapResponse(
                onWebAuthnSignUp(
                  {
                    error: null,
                    tokenData: result.tokenData,
                  },
                  req,
                ),
                false,
              );
            } else {
              return _wrapResponse(
                onWebAuthnSignUp({ error: null, tokenData: null }, req),
                false,
              );
            }
          }
          case "webauthn/signin": {
            if (!onWebAuthnSignIn) {
              throw new ConfigurationError(
                `'onWebAuthnSignIn' auth route handler not configured`,
              );
            }
            const { email, assertion } = await req.json();

            let tokenData: TokenData;
            try {
              tokenData = await (
                await this.core
              ).signinWithWebAuthn(email, assertion);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              return _wrapResponse(onWebAuthnSignIn({ error }, req), false);
            }
            this.setAuthCookie(tokenData.auth_token);
            return _wrapResponse(
              onWebAuthnSignIn({ error: null, tokenData }, req),
              false,
            );
          }
          case "magiclink/signup": {
            if (!this.options.magicLinkFailurePath) {
              throw new ConfigurationError(
                `'magicLinkFailurePath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
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
            await this.setVerifierCookie(verifier);
            return isAction
              ? Response.json({ _data: null })
              : new Response(null, { status: 204 });
          }
          case "magiclink/send": {
            if (!this.options.magicLinkFailurePath) {
              throw new ConfigurationError(
                `'magicLinkFailurePath' option not configured`,
              );
            }
            const data = await _getReqBody(req);
            const isAction = _isAction(data);
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
            await this.setVerifierCookie(verifier);
            return isAction
              ? Response.json({ _data: null })
              : new Response(null, { status: 204 });
          }
          default:
            return new Response("Unknown auth route", {
              status: 404,
            });
        }
      },
    };
  }
}

export class NextAuthSession {
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

function _getReqBody(
  req: NextRequest,
): Promise<FormData | Record<string, unknown>> {
  return req.headers.get("Content-Type") === "application/json"
    ? req.json()
    : req.formData();
}

function _isAction(data: any) {
  return typeof data === "object" && data._action === true;
}

export function _extractParams(
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

function _wrapResponse(res: Promise<Response> | undefined, isAction: boolean) {
  if (isAction) {
    return (
      res
        ?.then(async (res) => Response.json({ _data: await res.json() }))
        .catch((err) => {
          return Response.json(_isRedirect(err) || _wrapError(err));
        }) ?? Response.json({ _data: null })
    );
  }
  return res;
}

function _wrapError(err: Error) {
  return {
    _error: {
      type: err instanceof GelAuthError ? err.type : null,
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

function _isRedirect(error: any) {
  if (
    !(error instanceof Error) ||
    error.message !== "NEXT_REDIRECT" ||
    typeof (error as any).digest !== "string"
  ) {
    return false;
  }
  const [_, type, location] = ((error as any).digest as string).split(";");
  return { _redirect: { location, replace: type === "replace" } };
}
