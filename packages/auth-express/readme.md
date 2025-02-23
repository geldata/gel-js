# `@gel/auth-express`

This library provides a set of utilities to help you integrate authentication into your [Express](https://expressjs.com/) application. It supports various authentication methods including OAuth, email/password, and session-based authentication.

## Installation

This package is published on npm and can be installed with your package manager of choice.

```bash
npm install @gel/auth-express
```

**Note:** We have tested this library against the latest version of Express v4 with the types provided at DefinitelyTyped and have set up `peerDependencies` based on typical usage with npm.

## Setup

**Prerequisites**:

- Node v18+
  - **Note**: Due to using the `crypto` global, you will need to start Node with `--experimental-global-webcrypto`. You can add this option to your `NODE_OPTIONS` environment variable, like `NODE_OPTIONS='--experimental-global-webcrypto'` in the appropriate `.env` file.
- Before adding Gel auth to your Express app, you will first need to enable the `auth` extension in your Gel schema, and have configured the extension with some providers (you can do this in CLI or Gel UI). Refer to the auth extension docs for details on how to do this.
- We depend on the following middleware being installed in your Express app:
  - `body-parser`: both JSON and urlencoded
  - `cookie-parser`

```ts
import express from "express";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
```

This library provides a few affordances for adding Gel Auth to your existing Express app:

- Routers and route handlers to handle the authentication flow required by Gel.
- Middleware to attach sessions to requests.
- Some additional utility functions for handling various auth related concerns.

## Configuring the `ExpressAuth` class

After [configuring the Gel Auth extension](https://www.geldata.com/docs/guides/auth/index), you can set up the various auth routes with our route builders.

Start by instantiating an `ExpressAuth` object by passing it a configured Gel client and some options:

```ts
import { createClient } from "gel";
import createExpressAuth from "@gel/auth-express";
import * as expressAuth from "@gel/auth-express";

const client = createClient();
const auth = createExpressAuth(client, {
  baseUrl: "http://localhost:3000", // Put the URL to your Express app here
});
```

## Using the session middleware: `createSessionMiddleware`

We provide a middleware factory that will attach an `ExpressAuthSession` object to your request object, which you can use to make authenticated queries, or protect routes.

```ts
app.use(auth.createSessionMiddleware());
```

You can then use the `SessionRequest` type for your route's request parameter, which extends the Express `Request` type with `session?: ExpressAuthSession`.

```ts
app.get("/dashboard", (req: expressAuth.SessionRequest, res) => {
  if (!(await req.session?.isSignedIn())) {
    return res.redirect("/auth/builtin/signin");
  }

  // Render a template using Pug or EJS
  res.render("dashboard", {
    title: "Dashboard",
    message: "Welcome to your dashboard!",
  });
});
```

### Create your own `requireAuth` middleware

You can centralize the logic to redirect unauthenticated routes into a custom middleware like this:

```ts
function requireAuth(
  req: expressAuth.SessionRequest,
  res: Response,
  next: NextFunction,
) {
  if (!(await req.session?.isSignedIn())) {
    return res.redirect("/auth/builtin/signin");
  }

  next();
}
```

Then you can use this to protect your route like this:

```ts
app.get("/dashboard", requireAuth, (req: expressAuth.SessionRequest, res) => {
  // Render a template using Pug or EJS
  res.render("dashboard", {
    title: "Dashboard",
    message: "Welcome to your dashboard!",
  });
});
```

## Adding route handlers

Route handlers can be added either using one or more of our "router factories", or by constructing your own Express `Router` object, and attaching the necessary middleware to routes that you configure yourself. The factory pattern makes it easy to quickly get a standardized set of routes to handle either the built-in UI, or some combination of email/password and/or OAuth routes. For maximum control over route locations, custom middleware patterns, or integration into existing router structures, you can use the router middleware.

#### `signout`

We provide a "signout" route handler that is used to reset the `req.session`, and remove the authentication cookie from the browser session. It works across all of the various authentication strategies, so it is included as a bare middleware that you add to your Express router yourself, adding a route handler for redirecting after the sign-out completes.

```ts
app.get("/signout", expressAuth.signout, (req, res) => {
  res.redirect("/goodbye");
});
```

### Router factories

#### Built-in UI: `createBuiltinRouter`

When using the built-in UI, be sure to set your `redirect_to` and `redirect_to_on_signup` values in the configuration to the route that the callback is mounted to, adding `?isSignUp=true` to the `redirect_to_on_signup` value.

- `callback: (express.RouteHandler | express.ErrorHandler)[]`, required, Once the authentication flow completes, this callback will be called, and you must return a terminating Express route handler here. Typically, you'll redirect to elsewhere in your app based on `req.isSignUp`.

```ts
const builtinRouter = auth.createBuiltinRouter({
  callback: [
    (req: expressAuth.CallbackRequest, res, next) => {
      if (req.isSignUp) {
        return res.redirect("/onboarding");
      }

      res.redirect("/");
    },
  ],
});

app.use("/auth", builtinRouter);
// Creates the following routes:
// - GET /auth/signin: Redirects to built-in UI's sign in page
// - GET /auth/signup: Redirects to built-in UI's sign up page
// - GET /auth/callback: Handles successful authentication. Typically you'll create a new user if `isSignUp` is true, and redirect appropriately.
```

### Custom UI: Email and password `createEmailPasswordRouter`

- `routerPath: string`, required, This is the path relative to the `baseUrl` given that was configured when creating the `ExpressAuth` object that this router will be attached to. This is used to build the URL to the email verification path configured by the router factory.
- `signIn: (express.RouteHandler | express.ErrorHandler)[]`, required, Attached middleware executes when sign-in attempt succeeds. Typically you will redirect the user to your application here.
- `signUp: (express.RouteHandler | express.ErrorHandler)[]`, required, Attached middleware executes when sign-up attempt succeeds. Typically you will redirect the user to your application here.
- `verify: (express.RouteHandler | express.ErrorHandler)[]`, Attached middleware executes after the user verifies their email successfully. Typically you will redirect the user to your application here.
- `sendPasswordResetEmail: (express.RouteHandler | express.ErrorHandler)[]`, Attached middleware executes after the user sends a password reset. Typically you will redirect the user to some success page containing instructions to look for a reset email.
- `resetPassword: (express.RouteHandler | express.ErrorHandler)[]`, Attached middleware executes after the user successfully resets their password. Typically you will redirect the user to your application here.
- `resendVerificationEmail: (express.RouteHandler | express.ErrorHandler)[]`, Attached middleware executes after the user resends their email verification email. Typically you will redirect the user to some success page, or if you do not _require_ verification to use your app, you can redirect to your app here.

```ts
const emailPasswordRouter = auth.createEmailPasswordRouter(
  "/auth/email-password", // Path to mount router at
  "/forgot-password", // Path to your custom reset password UI
  {
    signIn: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/");
      },
    ],
    signUp: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/onboarding");
      },
    ],
    verify: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/");
      },
    ],
    sendPasswordResetEmail: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/email-success");
      },
    ],
    resetPassword: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/email-success");
      },
    ],
    resendVerificationEmail: [
      (req: expressAuth.AuthRequest, res) => {
        res.redirect("/");
      },
    ],
  },
);

app.use(emailPasswordRouter);
// This creates the following routes:
// - POST /auth/email-password/signin
// - POST /auth/email-password/signup
// - GET /auth/email-password/verify
// - POST /auth/email-password/send-password-reset-email
// - POST /auth/email-password/reset-password
// - POST /auth/email-password/resend-verification-email
```

### Custom UI: OAuth `createOAuthRouter`

- `routerPath: string`, required, This is the path relative to the `baseUrl` given that was configured when creating the `ExpressAuth` object that this router will be attached to. This is used to build the URL to the callback path configured by the router factory.
- `callback: (express.RouteHandler | express.ErrorHandler)[]`, required, Once the authentication flow completes, this callback will be called, and you must return a terminating Express route handler here. Typically, you'll redirect to elsewhere in your app based on `req.isSignUp`.

```ts
const oAuthRouter = auth.createOAuthRouter("/auth/oauth", {
  callback: [
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  ],
});

app.use(oAuthRouter);
// This creates the following routes:
// - GET /auth/oauth/
// - GET /auth/oauth/callback
```

### Custom UI: Magic Link

- `routerPath: string`, required, This is the path relative to the `baseUrl` configured when creating the `ExpressAuth` object. This path is used to build the URL for the callback path configured by the router factory.
- `failureUrl: string`, required, URL to redirect to in case of a failure during the Magic Link process.
- `callback: (express.RouteHandler | express.ErrorHandler)[]`, required, Once the authentication flow completes, this callback will be called, and you must return a terminating Express route handler here. Typically, you'll redirect to elsewhere in your app based on `req.isSignUp`.
- `send: (express.RouteHandler | express.ErrorHandler)[]`, this route handler stack will be called when a request is made to send a magic link to a registered email address. Typically, you'll return some HTML or a redirect here that indicates that the user should check their email.
- `signup: (express.RouteHandler | express.ErrorHandler)[]`, this route handler stack will be called when a request is made to register an email address. Typically, you'll return some HTML or a redirect here that indicates that the user should check their email.

```ts
const magicLinkRouter = auth.createMagicLinkRouter(
  "/auth/magic-link",
  "/login-failure",
  {
    callback: [
      (req: expressAuth.CallbackRequest, res) => {
        res.redirect("/");
      },
    ],
    send: [
      (req, res) => {
        res.redirect("/check-email.html");
      },
    ],
    signUp: [
      (req, res) => {
        res.redirect("/check-email.html");
      },
    ],
  },
);

app.use(magicLinkRouter);
// This creates the following routes:
// - POST /auth/magic-link/send
// - POST /auth/magic-link/signup
// - GET /auth/magic-link/callback
```

### Custom UI: WebAuthn

Unlike the other authentication methods, WebAuthn requires a client-side script that runs in the browser. This script requests JSON from the Gel Auth server that gets options to pass to the Web Authentication API built into the browser, and then after successfully creating new credentials or retrieving existing credentials, it calls back to the endpoints you're configuring below.

In order to facilitate the sign in and sign up ceremonies, we export a helper class called `WebAuthnClient` that you must configure with some relevant paths based on how you set up your routing below.

```ts
import { WebAuthnClient } from "@gel/auth-express";

const webAuthnClient = new WebAuthnClient({
  signupOptionsUrl: "http://localhost:3000/auth/webauthn/signup/options",
  signupUrl: "http://localhost:3000/auth/webauthn/signup",
  signinOptionsUrl: "http://localhost:3000/auth/webauthn/signin/options",
  signinUrl: "http://localhost:3000/auth/webauthn/signin",
  verifyUrl: "http://localhost:3000/auth/webauthn/verify",
});
```

- `routerPath: string`, required, This is the path relative to the `baseUrl` configured when creating the `ExpressAuth` object. This path is used to build the URL for the callback path configured by the router factory.
- `signIn: (express.RouteHandler | express.ErrorHandler)[]`, required, Attached middleware executes when sign-in attempt succeeds. Typically you will redirect the user to your application here.
- `signUp: (express.RouteHandler | express.ErrorHandler)[]`, required, Attached middleware executes when sign-up attempt succeeds. Typically you will redirect the user to your application here.
- `verify: (express.RouteHandler | express.ErrorHandler)[]`, Attached middleware executes after the user verifies their email successfully. Typically you will redirect the user to your application here.
- `signInOptions: (express.RouteHandler | express.ErrorHandler)[]`, This redirects the user to the appropriate URL of the Gel server to retrieve the WebAuthn sign in options.
- `signUpOptions: (express.RouteHandler | express.ErrorHandler)[]`, This redirects the user to the appropriate URL of the Gel server to retrieve the WebAuthn sign up options.

```ts
const webAuthnRouter = auth.createWebAuthnRouter("/auth/webauthn", {
  signInOptions: [],
  signIn: [
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  ],
  signUpOptions: [],
  signUp: [
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/onboarding");
    },
  ],
  verify: [
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  ],
});

app.use(webAuthnRouter);
// This creates the following routes:
// - GET /auth/webauthn/signin/options
// - POST /auth/webauthn/signin
// - GET /auth/webauthn/signup/options
// - POST /auth/webauthn/signup
// - GET /auth/webauthn/verify
```

### Custom router

Each route is also available as a middleware itself for maximum customization, to allow custom route names, per-route middleware customization, and integration with advanced Express patterns. Here are examples that are equivalent to the ones given in the router factory section:

#### Built-in UI

```ts
const builtinRouter = Router()
  .get("/signin", auth.builtin.signIn)
  .get("/signup", auth.builtin.signUp)
  .get(
    "/callback",
    auth.builtin.callback,
    (req: expressAuth.CallbackRequest, res, next) => {
      if (req.isSignUp) {
        return res.redirect("/onboarding");
      }

      res.redirect("/");
    },
  );

app.use("/auth", builtinRouter);
```

#### Custom UI: Email and password

```ts
const emailPasswordRouter = Router()
  .post(
    "/signin",
    auth.emailPassword.signIn,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  )
  .post(
    "/signup",
    auth.emailPassword.signUp(
      // URL of the verify endpoint configured below
      "http://localhost:3000/auth/email-password/verify",
    ),
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/onboarding");
    },
  )
  .get(
    "/verify",
    auth.emailPassword.verify,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  )
  .post(
    "/send-password-reset-email",
    auth.emailPassword.sendPasswordResetEmail(
      // URL of the reset password endpoint configured below
      "http://localhost:3000/auth/email-password/reset-password",
    ),
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/email-success");
    },
  )
  .post(
    "/reset-password",
    auth.emailPassword.resetPassword,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/email-success");
    },
  )
  .post(
    "/resend-verification-email",
    auth.emailPassword.resendVerificationEmail,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  );

app.use("/auth/email-password", emailPasswordRouter);
```

#### Custom UI: OAuth

```ts
const oAuthRouter = Router()
  .get(
    "/",
    auth.oAuth.redirect(
      // URL of the callback endpoint configured below
      "http://localhost:3000/auth/oauth/callback",
    ),
  )
  .get(
    "/callback",
    auth.oAuth.callback,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  );

app.use("/auth/oauth", oAuthRouter);
```

### Custom UI: Magic Link

```ts
const magicLinkRoute = Router()
  .post(
    "/send",
    auth.magicLink.send(
      // URL of the callback endpoint configured below
      "http://localhost:3000/auth/magic-link/callback",
      // URL of the route in your app that should receive login errors
      "/login-failure",
    ),
  )
  .post(
    "/signup",
    auth.magicLink.signUp(
      // URL of the callback endpoint configured below
      "http://localhost:3000/auth/magic-link/callback",
      // URL of the route in your app that should receive login errors
      "/login-failure",
    ),
  )
  .get(
    "/callback",
    auth.magicLink.callback,
    (req: expressAuth.CallbackRequest, res) => {
      // Custom logic after successful authentication
      res.redirect("/");
    },
  );

app.use("/auth/magic-link", router);
```

#### Custom UI: WebAuthn

```ts
const webAuthnRouter = Router()
  .get("/signin/options", auth.webauthn.signInOptions)
  .post(
    "/signin",
    auth.webauthn.signIn,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/");
    },
  )
  .get("/signup/options", auth.webauthn.signUpOptions)
  .post(
    "/signup",
    auth.webauthn.signUp,
    (req: expressAuth.AuthRequest, res) => {
      res.redirect("/onboarding");
    },
  )
  .get("/verify", auth.webauthn.verify, (req: expressAuth.AuthRequest, res) => {
    res.redirect("/");
  });

app.use("/auth/webauthn", webAuthnRouter);
```

### Error handling

If an error occurs during the authentication flow, it will be passed to the Express error handler. You can use Express error handlers to handle errors either on individual routes by adding the error handlers to the middleware arrays or in your route definitions, or define a router-wide error handler. Any Express error handling pattern is available here, but let's examine a quick example of handling error with the built-in UI flow:

```ts
const builtinRouter = auth.createBuiltinRouter({
  callback: [
    (req: expressAuth.CallbackRequest, res, next) => {
      if (req.isSignUp) {
        return res.redirect("/onboarding");
      }

      res.redirect("/");
    },
    (error: any, req, res, next) => {
      res.redirect(`/error?error=${encodeURIComponent(error.message)}`);
    },
  ],
});
```

## Reference

### `createExpressAuth` (default package export)

- `baseUrl: string`, required, The url of your application; needed for various auth flows (eg. OAuth) to redirect back to.
- `authCookieName?: string`, The name of the cookie where the auth token will be stored, defaults to 'gel-session'.
- `pkceVerifierCookieName?: string`: The name of the cookie where the verifier for the PKCE flow will be stored, defaults to 'gel-pkce-verifier'
- `passwordResetUrl?: string`: The url of the the password reset page; needed if you want to enable password reset emails in your app.

Returns: `ExpressAuth`

### `ExpressAuth`

- `isPasswordResetTokenValid(resetToken: string)`: Checks if the provided password reset token is valid.
- `getSession(req: ExpressRequest)`: Returns the session for the specified request.
- `getProvidersInfo()`: Returns information about the available providers.
- `createSessionMiddleware()`: Creates a session middleware.

For the router factories and route middleware, see the sections above for configuring routes for full documentation and usage instructions.

### `ExpressAuthSession`

- `client: Client`: `ext::auth::auth_token` global set based on the auth token that is present in the authentication cookie. If there is no cookie, the `Client` will be the original client that was passed when creating the `ExpressAuth` object.
- `isSignedIn: () => Promise<boolean>`: Checks to see if this Request has a valid, unexpired auth token.

### `TokenData`

Represents the result of successfully completing authentication.

- `auth_token: string`: The raw JWT returned by the server.
- `identity_id: string | null`: The UUID of the `ext::auth::Identity`
- `provider_token: string | null`: If the identity is an OAuth identity, this is the original auth token provided by the Identity Provider.
- `provider_refresh_token: string | null`: If the identity is an OAuth identity, this is the original refresh token provided by the Identity Provider, if it was provided by the provider.

### `CallbackRequest`

This is an extension of the Express `Request` interface containing some optional data added by auth callback middleware (either from the built-in UI or in an OAuth callback flow):

- `req.session?: ExpressAuthSession`
- `req.tokenData?: TokenData`
- `req.provider?: ProviderName`: The name of the provider type that this authentication event is for.
- `req.isSignUp?: boolean`: If this authentication event represents a new user signing up, or an existing user signing in.

### `AuthRequest`

This is an extension of the Express `Request` interface containing some optional data added by the various auth middleware.

- `session?: ExpressAuthSession`
- `tokenData?: TokenData`
