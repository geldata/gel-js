import {
  Auth,
  builtinOAuthProviderNames,
  type emailPasswordProviderName,
  type BuiltinOAuthProviderNames,
  type TokenData,
  InvalidDataError,
  OAuthProviderFailureError,
  PKCEError,
  GelAuthError,
} from "@gel/auth-core";
import type { Client } from "gel";
import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
  Router,
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";

type RouterStack = (RequestHandler | ErrorRequestHandler)[];

export * from "@gel/auth-core/errors";

export type BuiltinProviderNames =
  | BuiltinOAuthProviderNames
  | typeof emailPasswordProviderName;

export interface SessionRequest extends ExpressRequest {
  session?: ExpressAuthSession;
}

export interface TokenDataRequest extends ExpressRequest {
  tokenData?: TokenData;
}

export interface AuthRequest extends SessionRequest, TokenDataRequest {}

export interface CallbackRequest extends AuthRequest {
  provider?: BuiltinOAuthProviderNames;
  isSignUp?: boolean;
}

export class ExpressAuthSession {
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

export interface ExpressAuthOptions {
  baseUrl: string;
  authCookieName?: string;
  pkceVerifierCookieName?: string;
}

export class ExpressAuth {
  private readonly options: Required<ExpressAuthOptions>;
  private readonly core: Promise<Auth>;
  private readonly isSecure: boolean;

  constructor(
    protected readonly client: Client,
    options: ExpressAuthOptions,
  ) {
    this.options = {
      baseUrl: options.baseUrl.replace(/\/$/, ""),
      authCookieName: options.authCookieName ?? "gel-session",
      pkceVerifierCookieName:
        options.pkceVerifierCookieName ?? "gel-pkce-verifier",
    };
    this.core = Auth.create(client);
    this.isSecure = this.options.baseUrl.startsWith("https");
  }

  isPasswordResetTokenValid = (resetToken: string) => {
    return Auth.checkPasswordResetTokenValid(resetToken);
  };

  private createVerifierCookie = (res: ExpressResponse, verifier: string) => {
    const expires = new Date(Date.now() + 1000 * 60 * 24 * 7); // In 7 days
    res.cookie(this.options.pkceVerifierCookieName, verifier, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      expires,
      secure: this.isSecure,
    });
  };

  private createAuthCookie = (res: ExpressResponse, authToken: string) => {
    const expires = Auth.getTokenExpiration(authToken);
    res.cookie(this.options.authCookieName, authToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      expires: expires ?? undefined,
      secure: this.isSecure,
    });
  };

  private getVerifier(cookies: Record<string, string>) {
    return (
      cookies[this.options.pkceVerifierCookieName] ||
      cookies["edgedb-pkce-verifier"]
    );
  }

  private clearVerifierCookie(res: ExpressResponse) {
    res.clearCookie(this.options.pkceVerifierCookieName);
    res.clearCookie("edgedb-pkce-verifier");
  }

  private clearAuthCookie(res: ExpressResponse) {
    res.clearCookie(this.options.authCookieName, {
      httpOnly: true,
      sameSite: "strict",
    });
    res.clearCookie("edgedb-session", {
      httpOnly: true,
      sameSite: "strict",
    });
  }

  getSession = (req: ExpressRequest) => {
    const authCookie =
      req.cookies[this.options.authCookieName] || req.cookies["edgedb-session"];

    return new ExpressAuthSession(this.client, authCookie);
  };

  getProvidersInfo = async () => {
    return (await this.core).getProvidersInfo();
  };

  createSessionMiddleware = () => {
    return async (
      req: SessionRequest,
      _: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        req.session = this.getSession(req);
        next();
      } catch (err) {
        next(err);
      }
    };
  };

  createBuiltinRouter = ({ callback }: { callback: RouterStack }) => {
    const router = Router();

    router.get("/signin", this.builtin.signIn);
    router.get("/signup", this.builtin.signUp);
    router.get("/callback", this.builtin.callback, ...callback);

    return router;
  };

  createEmailPasswordRouter = (
    routerPath: string,
    resetPasswordPath: string,
    stacks: Record<keyof typeof this.emailPassword, RouterStack>,
  ) => {
    const router = Router();

    router.post("/signin", this.emailPassword.signIn, ...stacks.signIn);
    router.post(
      "/signup",
      this.emailPassword.signUp(
        new URL(`${routerPath}/verify`, this.options.baseUrl).toString(),
      ),
      ...stacks.signUp,
    );
    router.get("/verify", this.emailPassword.verify, ...stacks.verify);
    router.post(
      "/send-password-reset-email",
      this.emailPassword.sendPasswordResetEmail(
        new URL(resetPasswordPath, this.options.baseUrl).toString(),
      ),
      ...stacks.sendPasswordResetEmail,
    );
    router.post(
      "/reset-password",
      this.emailPassword.resetPassword,
      ...stacks.resetPassword,
    );
    router.post(
      "/resend-verification-email",
      this.emailPassword.resendVerificationEmail,
      ...stacks.resendVerificationEmail,
    );

    return Router().use(routerPath, router);
  };

  createOAuthRouter = (
    routerPath: string,
    {
      callback,
    }: {
      callback: RouterStack;
    },
  ) => {
    const router = Router();

    router.get(
      "/",
      this.oAuth.redirect(
        new URL(`${routerPath}/callback`, this.options.baseUrl).toString(),
      ),
    );
    router.get("/callback", this.oAuth.callback, ...callback);

    return Router().use(routerPath, router);
  };

  createMagicLinkRouter = (
    routerPath: string,
    failurePath: string,
    stacks: Record<keyof typeof this.magicLink, RouterStack>,
  ) => {
    const router = Router();

    router.post(
      "/send",
      this.magicLink.send(
        new URL(`${routerPath}/callback`, this.options.baseUrl).toString(),
        new URL(failurePath, this.options.baseUrl).toString(),
      ),
      ...stacks.send,
    );
    router.post(
      "/signup",
      this.magicLink.signUp(
        new URL(`${routerPath}/callback`, this.options.baseUrl).toString(),
        new URL(failurePath, this.options.baseUrl).toString(),
      ),
      ...stacks.signUp,
    );
    router.get("/callback", this.magicLink.callback, ...stacks.callback);

    return Router().use(routerPath, router);
  };

  createWebAuthnRouter = (
    routerPath: string,
    stacks: Record<keyof typeof this.webAuthn, RouterStack>,
  ) => {
    const router = Router();

    router.get(
      "/signin/options",
      this.webAuthn.signInOptions,
      ...stacks.signInOptions,
    );
    router.post("/signin", this.webAuthn.signIn, ...stacks.signIn);
    router.get(
      "/signup/options",
      this.webAuthn.signUpOptions,
      ...stacks.signUpOptions,
    );
    router.post("/signup", this.webAuthn.signUp, ...stacks.signUp);
    router.get("/verify", this.webAuthn.verify, ...stacks.verify);

    return Router().use(routerPath, router);
  };

  signout = async (
    req: AuthRequest,
    res: ExpressResponse,
    next: NextFunction,
  ) => {
    try {
      this.clearAuthCookie(res);
      req.session = new ExpressAuthSession(this.client, undefined);
      req.tokenData = undefined;
      next();
    } catch (err) {
      next(err);
    }
  };

  oAuth = {
    redirect:
      (callbackUrl: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          const searchParams = new URLSearchParams(req.url.split("?")[1]);
          const provider = searchParams.get(
            "provider_name",
          ) as BuiltinOAuthProviderNames | null;
          if (!provider || !builtinOAuthProviderNames.includes(provider)) {
            throw new InvalidDataError(`invalid provider_name: ${provider}`);
          }
          const pkceSession = await this.core.then((core) =>
            core.createPKCESession(),
          );
          this.createVerifierCookie(res, pkceSession.verifier);
          res.redirect(
            pkceSession.getOAuthUrl(
              provider,
              callbackUrl,
              `${callbackUrl}?isSignUp=true`,
            ),
          );
        } catch (err) {
          next(err);
        }
      },

    callback: async (
      req: CallbackRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const error = searchParams.get("error");
        if (error) {
          const desc = searchParams.get("error_description");
          throw new OAuthProviderFailureError(
            error + (desc ? `: ${desc}` : ""),
          );
        }
        const code = searchParams.get("code");
        const verificationEmailSentAt = searchParams.get(
          "verification_email_sent_at",
        );

        if (!code) {
          if (verificationEmailSentAt) {
            req.session = new ExpressAuthSession(this.client, undefined);
            req.isSignUp = true;
          }
          throw new PKCEError("no pkce code in response");
        }
        const verifier = this.getVerifier(req.cookies);
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const isSignUp = searchParams.get("isSignUp") === "true";
        const tokenData = await (await this.core).getToken(code, verifier);
        this.createAuthCookie(res, tokenData.auth_token);
        this.clearVerifierCookie(res);

        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        req.isSignUp = isSignUp;
        req.provider = searchParams.get(
          "provider",
        ) as BuiltinOAuthProviderNames;
        next();
      } catch (err) {
        next(err);
      }
    },
  };

  builtin = {
    signIn: async (
      _: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const pkceSession = await this.core.then((core) =>
          core.createPKCESession(),
        );
        this.createVerifierCookie(res, pkceSession.verifier);
        res.redirect(pkceSession.getHostedUISigninUrl());
      } catch (err) {
        next(err);
      }
    },
    signUp: async (
      _: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const pkceSession = await this.core.then((core) =>
          core.createPKCESession(),
        );
        this.createVerifierCookie(res, pkceSession.verifier);
        res.redirect(pkceSession.getHostedUISignupUrl());
      } catch (err) {
        next(err);
      }
    },
    callback: async (
      req: CallbackRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const error = searchParams.get("error");
        if (error) {
          const desc = searchParams.get("error_description");
          throw new GelAuthError(error + (desc ? `: ${desc}` : ""));
        }
        const code = searchParams.get("code");
        const verificationEmailSentAt = searchParams.get(
          "verification_email_sent_at",
        );

        if (!code) {
          if (verificationEmailSentAt) {
            req.session = new ExpressAuthSession(this.client, undefined);
            req.isSignUp = true;
          }
          throw new PKCEError("no pkce code in response");
        }
        const verifier = this.getVerifier(req.cookies);
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const isSignUp = searchParams.get("isSignUp") === "true";
        const tokenData = await (await this.core).getToken(code, verifier);
        this.createAuthCookie(res, tokenData.auth_token);
        // n.b. we need to keep the verifier cookie around for the email
        // verification flow which uses the same PKCE session

        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        req.isSignUp = isSignUp;
        req.provider = searchParams.get(
          "provider",
        ) as BuiltinOAuthProviderNames;
        next();
      } catch (err) {
        next(err);
      }
    },
  };

  emailPassword = {
    signIn: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const [email, password] = _extractParams(
          req.body,
          ["email", "password"],
          "email or password missing from request body",
        );
        const tokenData = await (
          await this.core
        ).signinWithEmailPassword(email, password);
        this.createAuthCookie(res, tokenData.auth_token);
        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        next();
      } catch (err) {
        next(err);
      }
    },
    signUp:
      (verifyUrl: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          const [email, password] = _extractParams(
            req.body,
            ["email", "password"],
            "email or password missing from request body",
          );
          const result = await (
            await this.core
          ).signupWithEmailPassword(email, password, verifyUrl);
          this.createVerifierCookie(res, result.verifier);
          if (result.status === "complete") {
            this.createAuthCookie(res, result.tokenData.auth_token);
            req.session = new ExpressAuthSession(
              this.client,
              result.tokenData.auth_token,
            );
            req.tokenData = result.tokenData;
          } else {
            req.session = new ExpressAuthSession(this.client, undefined);
          }
          next();
        } catch (err) {
          next(err);
        }
      },
    verify: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const verificationToken = searchParams.get("verification_token");
        const verifier = this.getVerifier(req.cookies);
        if (!verificationToken) {
          throw new PKCEError("no verification_token in response");
        }
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const tokenData = await (
          await this.core
        ).verifyEmailPasswordSignup(verificationToken, verifier);
        this.createAuthCookie(res, tokenData.auth_token);
        this.clearVerifierCookie(res);

        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        next();
      } catch (err) {
        next(err);
      }
    },
    sendPasswordResetEmail:
      (passwordResetUrl: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          const [email] = _extractParams(
            req.body,
            ["email"],
            "email missing from request body",
          );
          const { verifier } = await (
            await this.core
          ).sendPasswordResetEmail(email, passwordResetUrl);
          this.createVerifierCookie(res, verifier);
          res.status(204);
          next();
        } catch (err) {
          next(err);
        }
      },
    resetPassword: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const verifier = this.getVerifier(req.cookies);
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const [resetToken, password] = _extractParams(
          req.body,
          ["reset_token", "password"],
          "reset_token or password missing from request body",
        );

        const tokenData = await (
          await this.core
        ).resetPasswordWithResetToken(resetToken, verifier, password);
        this.createAuthCookie(res, tokenData.auth_token);
        this.clearVerifierCookie(res);
        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        next();
      } catch (err) {
        next(err);
      }
    },
    resendVerificationEmail:
      (verifyUrl?: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          if ("verification_token" in req.body) {
            const verificationToken = req.body.verification_token;
            if (typeof verificationToken !== "string") {
              throw new InvalidDataError(
                "expected 'verification_token' to be a string",
              );
            }
            await (await this.core).resendVerificationEmail(verificationToken);
          } else if ("email" in req.body) {
            const email = req.body.email;
            if (typeof email !== "string") {
              throw new InvalidDataError("expected 'email' to be a string");
            }
            if (!verifyUrl) {
              throw new InvalidDataError(
                "verifyUrl is required when email is provided",
              );
            }
            const { verifier } = await (
              await this.core
            ).resendVerificationEmailForEmail(email, verifyUrl);
            this.createVerifierCookie(res, verifier);
          } else {
            throw new InvalidDataError(
              "verification_token or email missing from request body",
            );
          }
          res.status(204);
          next();
        } catch (err) {
          next(err);
        }
      },
  };

  magicLink = {
    callback: async (
      req: CallbackRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const error = searchParams.get("error");
        if (error) {
          const desc = searchParams.get("error_description");
          throw new GelAuthError(error + (desc ? `: ${desc}` : ""));
        }
        const code = searchParams.get("code");
        if (!code) {
          throw new PKCEError("no pkce code in response");
        }

        const isSignUp = searchParams.get("isSignUp") === "true";
        const verifier = this.getVerifier(req.cookies);
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const tokenData = await (await this.core).getToken(code, verifier);
        this.createAuthCookie(res, tokenData.auth_token);
        this.clearVerifierCookie(res);
        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        req.isSignUp = isSignUp;
        next();
      } catch (err) {
        next(err);
      }
    },
    signUp:
      (callbackUrl: string, failureUrl: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          const [email] = _extractParams(
            req.body,
            ["email"],
            "email missing from request body",
          );
          console.log(
            `magic link signup: ${JSON.stringify(
              { callbackUrl, failureUrl, email },
              null,
              2,
            )}`,
          );
          const { verifier } = await (
            await this.core
          ).signupWithMagicLink(email, callbackUrl, failureUrl);
          this.createVerifierCookie(res, verifier);
          next();
        } catch (err) {
          next(err);
        }
      },
    send:
      (callbackUrl: string, failureUrl: string) =>
      async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
          const [email] = _extractParams(
            req.body,
            ["email"],
            "email missing from request body",
          );
          console.log(
            `magic link send: ${JSON.stringify(
              { callbackUrl, failureUrl, email },
              null,
              2,
            )}`,
          );
          const { verifier } = await (
            await this.core
          ).signinWithMagicLink(email, callbackUrl, failureUrl);
          this.createVerifierCookie(res, verifier);
          next();
        } catch (err) {
          next(err);
        }
      },
  };

  webAuthn = {
    verify: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const verificationToken = searchParams.get("verification_token");
        const verifier = this.getVerifier(req.cookies);
        if (!verificationToken) {
          throw new PKCEError("no verification_token in response");
        }
        if (!verifier) {
          throw new PKCEError("no pkce verifier cookie found");
        }
        const tokenData = await (
          await this.core
        ).verifyWebAuthnSignup(verificationToken, verifier);
        this.createAuthCookie(res, tokenData.auth_token);
        this.clearVerifierCookie(res);

        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        next();
      } catch (err) {
        next(err);
      }
    },
    signInOptions: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const email = searchParams.get("email");
        if (!email) {
          throw new InvalidDataError("email missing from request query");
        }
        const optionsUrl = (await this.core).getWebAuthnSigninOptionsUrl(email);
        res.redirect(optionsUrl);
      } catch (err) {
        next(err);
      }
    },
    signIn: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const { email, assertion } = req.body;
        const tokenData = await (
          await this.core
        ).signinWithWebAuthn(email, assertion);
        this.createAuthCookie(res, tokenData.auth_token);
        req.session = new ExpressAuthSession(this.client, tokenData.auth_token);
        req.tokenData = tokenData;
        next();
      } catch (err) {
        next(err);
      }
    },
    signUpOptions: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const searchParams = new URLSearchParams(req.url.split("?")[1]);
        const email = searchParams.get("email");
        if (!email) {
          throw new InvalidDataError("email missing from request query");
        }
        const optionsUrl = (await this.core).getWebAuthnSignupOptionsUrl(email);
        res.redirect(optionsUrl);
      } catch (err) {
        next(err);
      }
    },
    signUp: async (
      req: AuthRequest,
      res: ExpressResponse,
      next: NextFunction,
    ) => {
      try {
        const { email, credentials, verify_url, user_handle } = req.body;
        const result = await (
          await this.core
        ).signupWithWebAuthn(email, credentials, verify_url, user_handle);
        const verifier = result.verifier;
        this.createVerifierCookie(res, verifier);

        if (result.status === "complete") {
          this.createAuthCookie(res, result.tokenData.auth_token);
          req.session = new ExpressAuthSession(
            this.client,
            result.tokenData.auth_token,
          );
          req.tokenData = result.tokenData;
        } else {
          req.session = new ExpressAuthSession(this.client, undefined);
        }
        next();
      } catch (err) {
        next(err);
      }
    },
  };
}

export default function createExpressAuth(
  client: Client,
  options: ExpressAuthOptions,
) {
  return new ExpressAuth(client, options);
}

function _extractParams(
  data: Record<string, unknown>,
  paramNames: string[],
  errMessage: string,
) {
  const params: string[] = [];
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
  return params;
}
