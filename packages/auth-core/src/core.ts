import { jwtDecode } from "jwt-decode";
import * as gel from "gel";
import { type ResolvedConnectConfig } from "gel/dist/conUtils";

import * as pkce from "./pkce";
import {
  type BuiltinOAuthProviderNames,
  emailPasswordProviderName,
  webAuthnProviderName,
  magicLinkProviderName,
} from "./consts";
import { requestGET, requestPOST } from "./utils";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  TokenData,
  RegistrationResponse,
  SignupResponse,
} from "./types";
import * as errors from "./errors";

export class Auth {
  /** @internal */
  public readonly baseUrl: string;

  protected constructor(
    public readonly client: gel.Client,
    baseUrl: string,
  ) {
    this.baseUrl = baseUrl;
  }

  static async create(client: gel.Client) {
    const connectConfig: ResolvedConnectConfig = (
      await (client as any).pool._getNormalizedConnectConfig()
    ).connectionParams;

    const [host, port] = connectConfig.address;
    const baseUrl = `${
      connectConfig.tlsSecurity === "insecure" ? "http" : "https"
    }://${host}:${port}/db/${connectConfig.database}/ext/auth/`;

    return new this(client, baseUrl);
  }

  /** @internal */
  public async _get<T = unknown>(
    path: string,
    searchParams?: Record<string, string>,
  ): Promise<T> {
    return requestGET<T>(new URL(path, this.baseUrl).href, searchParams);
  }

  /** @internal */
  public async _post<T = unknown>(path: string, body?: object): Promise<T> {
    return requestPOST<T>(new URL(path, this.baseUrl).href, body);
  }

  async createPKCESession() {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    return new AuthPCKESession(this, challenge, verifier);
  }

  async getToken(code: string, verifier: string): Promise<TokenData> {
    const tokenData = await this._get<TokenData>(`token`, { code, verifier });
    // n.b. Versions before v6 did not return the provider_id_token or identity_id
    return {
      ...tokenData,
      identity_id: tokenData.identity_id ?? null,
      provider_id_token: tokenData.provider_id_token ?? null,
    };
  }

  getWebAuthnSignupOptionsUrl(email: string) {
    const url = new URL(`webauthn/register/options`, this.baseUrl);
    url.searchParams.append("email", email);
    return url.href;
  }

  async signupWithWebAuthn(
    email: string,
    credentials: RegistrationResponseJSON,
    verifyUrl: string,
    userHandle: string,
  ): Promise<SignupResponse> {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    const result = await this._post<RegistrationResponse>("webauthn/register", {
      provider: webAuthnProviderName,
      challenge,
      credentials,
      email,
      verify_url: verifyUrl,
      user_handle: userHandle,
    });

    if ("code" in result) {
      return {
        status: "complete",
        verifier,
        tokenData: await this.getToken(result.code, verifier),
      };
    } else {
      return {
        status: "verificationRequired",
        verifier,
        identity_id: result.identity_id ?? null,
      };
    }
  }

  getWebAuthnSigninOptionsUrl(email: string) {
    const url = new URL(`webauthn/authenticate/options`, this.baseUrl);
    url.searchParams.append("email", email);
    return url.href;
  }

  async signinWithWebAuthn(
    email: string,
    assertion: AuthenticationResponseJSON,
  ): Promise<TokenData> {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    const { code } = await this._post<{ code: string }>(
      "webauthn/authenticate",
      {
        provider: webAuthnProviderName,
        challenge,
        email,
        assertion,
      },
    );

    return this.getToken(code, verifier);
  }

  async verifyWebAuthnSignup(verificationToken: string, verifier: string) {
    const { code } = await this._post<{ code: string }>("verify", {
      provider: webAuthnProviderName,
      verification_token: verificationToken,
    });
    return this.getToken(code, verifier);
  }

  async signinWithEmailPassword(email: string, password: string) {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    const { code } = await this._post<{ code: string }>("authenticate", {
      provider: emailPasswordProviderName,
      challenge,
      email,
      password,
    });
    return this.getToken(code, verifier);
  }

  async signupWithEmailPassword(
    email: string,
    password: string,
    verifyUrl: string,
  ): Promise<SignupResponse> {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    const result = await this._post<RegistrationResponse>("register", {
      provider: emailPasswordProviderName,
      challenge,
      email,
      password,
      verify_url: verifyUrl,
    });
    if ("code" in result) {
      return {
        status: "complete",
        verifier,
        tokenData: await this.getToken(result.code, verifier),
      };
    } else {
      return {
        status: "verificationRequired",
        verifier,
        identity_id: result.identity_id ?? null,
      };
    }
  }

  async verifyEmailPasswordSignup(verificationToken: string, verifier: string) {
    const { code } = await this._post<{ code: string }>("verify", {
      provider: emailPasswordProviderName,
      verification_token: verificationToken,
    });
    return this.getToken(code, verifier);
  }

  async signupWithMagicLink(
    email: string,
    callbackUrl: string,
    redirectOnFailure: string,
  ): Promise<{ verifier: string }> {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    await this._post("magic-link/register", {
      provider: magicLinkProviderName,
      email,
      challenge,
      callback_url: callbackUrl,
      redirect_on_failure: redirectOnFailure,
    });
    return { verifier };
  }

  async signinWithMagicLink(
    email: string,
    callbackUrl: string,
    redirectOnFailure: string,
  ): Promise<{ verifier: string }> {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    await this._post("magic-link/email", {
      provider: magicLinkProviderName,
      challenge,
      email,
      callback_url: callbackUrl,
      redirect_on_failure: redirectOnFailure,
    });

    return { verifier };
  }

  async resendVerificationEmail(verificationToken: string) {
    await this._post("resend-verification-email", {
      provider: emailPasswordProviderName,
      verification_token: verificationToken,
    });
  }

  async resendVerificationEmailForEmail(email: string, verifyUrl: string) {
    const { verifier, challenge } = await pkce.createVerifierChallengePair();
    await this._post("resend-verification-email", {
      provider: emailPasswordProviderName,
      email,
      verify_url: verifyUrl,
      challenge,
    });
    return { verifier };
  }

  async sendPasswordResetEmail(email: string, resetUrl: string) {
    const { challenge, verifier } = await pkce.createVerifierChallengePair();
    return {
      verifier,
      ...(await this._post<{ email_sent: string }>("send-reset-email", {
        provider: emailPasswordProviderName,
        challenge,
        email,
        reset_url: resetUrl,
      })),
    };
  }

  static getTokenExpiration(token: string) {
    try {
      const payload = jwtDecode(token);
      if (
        typeof payload !== "object" ||
        payload == null ||
        !("exp" in payload) ||
        typeof payload.exp !== "number"
      ) {
        return null;
      }
      return new Date(payload.exp * 1000);
    } catch {
      return null;
    }
  }

  static checkPasswordResetTokenValid(resetToken: string) {
    try {
      const expirationDate = this.getTokenExpiration(resetToken);
      return expirationDate && expirationDate.getTime() > Date.now();
    } catch {
      return false;
    }
  }

  async resetPasswordWithResetToken(
    resetToken: string,
    verifier: string,
    password: string,
  ) {
    const { code } = await this._post<{ code: string }>("reset-password", {
      provider: emailPasswordProviderName,
      reset_token: resetToken,
      password,
    });
    return this.getToken(code, verifier);
  }

  /**
   * When proxying the OAuth flow through your own server, you can use this
   * method to get the URL to redirect to that will include the required
   * parameters. Will throw an error if the auth server returns an error, or if
   * the response does not contain a location header.
   *
   * @param {URLSearchParams} searchParams From the original request. Gets
   * passed on to the auth server
   * @returns {string} The URL to redirect to
   */
  async handleOAuthAuthorize(searchParams: URLSearchParams): Promise<string> {
    const serverUrl = new URL("authorize", this.baseUrl);
    searchParams.forEach((value, key) => {
      serverUrl.searchParams.append(key, value);
    });

    const response = await fetch(serverUrl, {
      redirect: "manual",
    });

    if (response.status > 399) {
      throw new Error(
        `OAuth authorization failed with status ${response.status}: ${await response.text()}`,
      );
    }

    const location = response.headers.get("location");

    if (location == null) {
      throw new Error("OAuth authorization failed: no location header");
    }

    return location;
  }

  /**
   * When proxying the OAuth flow through your own server, you can use this
   * method to complete the flow, and get the URL to redirect to with the
   * correct parameters. Will throw an error if the auth server returns an
   * error, or if the response does not contain a location header.
   *
   * @param {URLSearchParams} searchParams From the original request. Gets
   * passed on to the auth server
   * @returns {string} The URL to redirect to
   */
  async handleOAuthCallback(searchParams: URLSearchParams): Promise<string> {
    const serverUrl = new URL("callback", this.baseUrl);
    searchParams.forEach((value, key) => {
      serverUrl.searchParams.append(key, value);
    });

    const response = await fetch(serverUrl, {
      redirect: "manual",
    });

    if (response.status > 399) {
      throw new Error(
        `OAuth callback failed with status ${response.status}: ${await response.text()}`,
      );
    }

    const location = response.headers.get("location");
    if (location == null) {
      throw new Error("OAuth callback failed: no location header");
    }

    return location;
  }

  async getProvidersInfo() {
    // TODO: cache this data when we have a way to invalidate on config update
    try {
      return await this.client.queryRequiredSingle<{
        oauth: { name: BuiltinOAuthProviderNames; display_name: string }[];
        emailPassword: boolean;
      }>(`
      with
        module ext::auth,
        providers := (select cfg::Config.extensions[is AuthConfig].providers)
      select {
        oauth := providers[is OAuthProviderConfig] {
          name,
          display_name
        },
        emailPassword := exists providers[is EmailPasswordProviderConfig]
      }`);
    } catch (err) {
      if (err instanceof gel.InvalidReferenceError) {
        throw new errors.ConfigurationError("auth extension is not enabled");
      }
      throw err;
    }
  }
}

export class AuthPCKESession {
  constructor(
    private auth: Auth,
    public readonly challenge: string,
    public readonly verifier: string,
  ) {}

  getOAuthUrl(
    providerName: BuiltinOAuthProviderNames,
    redirectTo: string,
    redirectToOnSignup?: string,
  ): string {
    return this.addOAuthParamsToUrl(new URL("authorize", this.auth.baseUrl), {
      providerName,
      redirectTo,
      redirectToOnSignup,
    }).toString();
  }

  /**
   * Build a URL with the required OAuth parameters used to call the OAuth
   * authorize endpoint.
   *
   * @param {URL | string} url If you pass a URL object, it will be mutated
   * and returned. If you pass a string, a new URL object will be created.
   * @param {Object} oauthParams
   * @returns {URL}
   */
  addOAuthParamsToUrl(
    url: string | URL,
    oauthParams: {
      providerName: string;
      redirectTo: string;
      redirectToOnSignup?: string;
      callbackUrl?: string;
    },
  ): URL {
    const withParams = typeof url === "string" ? new URL(url) : url;
    withParams.searchParams.set("provider", oauthParams.providerName);
    withParams.searchParams.set("challenge", this.challenge);
    withParams.searchParams.set("redirect_to", oauthParams.redirectTo);

    if (oauthParams.redirectToOnSignup) {
      withParams.searchParams.set(
        "redirect_to_on_signup",
        oauthParams.redirectToOnSignup,
      );
    }

    if (oauthParams.callbackUrl) {
      withParams.searchParams.set("callback_url", oauthParams.callbackUrl);
    }

    return withParams;
  }

  // getEmailPasswordSigninFormActionUrl(
  //   redirectTo: string,
  //   redirectToOnFailure?: string
  // ) {
  //   const params = new URLSearchParams({
  //     provider_name: emailPasswordProviderName,
  //     challenge: this.challenge,
  //     redirect_to: redirectTo,
  //   });

  //   if (redirectToOnFailure) {
  //     params.append("redirect_on_failure", redirectToOnFailure);
  //   }

  //   return `${this.auth.baseUrl}/authenticate?${params.toString()}`;
  // }

  // getEmailPasswordSignupFormActionUrl(
  //   redirectTo: string,
  //   redirectToOnFailure?: string
  // ) {
  //   const params = new URLSearchParams({
  //     provider_name: emailPasswordProviderName,
  //     challenge: this.challenge,
  //     redirect_to: redirectTo,
  //   });

  //   if (redirectToOnFailure) {
  //     params.append("redirect_on_failure", redirectToOnFailure);
  //   }

  //   return `${this.auth.baseUrl}/register?${params.toString()}`;
  // }

  getHostedUISigninUrl() {
    const url = new URL("ui/signin", this.auth.baseUrl);
    url.searchParams.set("challenge", this.challenge);

    return url.toString();
  }

  getHostedUISignupUrl() {
    const url = new URL("ui/signup", this.auth.baseUrl);
    url.searchParams.set("challenge", this.challenge);

    return url.toString();
  }
}
