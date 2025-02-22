# @gel/auth-remix

This library provides a set of utilities to help you integrate authentication into your [Remix](https://remix.run/) application.
It supports authentication with various OAuth providers, as well as email/password authentication.

## Installation

This package is published on npm and can be installed with your package manager of choice.

```bash
npm install @gel/auth-remix
```

## Setup

**Prerequisites**:

- Node v18+
  - **Note**: Due to using the `crypto` global, you will need to start Node with `--experimental-global-webcrypto`. You can add this option to your `NODE_OPTIONS` environment variable, like `NODE_OPTIONS='--experimental-global-webcrypto'` in the appropriate `.env` file.
- Before adding Gel auth to your Remix app, you will first need to enable the `auth` extension in your Gel schema, and have configured the extension with some providers (you can do this in CLI or Gel UI). Refer to the auth extension docs for details on how to do this.

1. Initialize the client auth helper by passing configuration options to `createClientAuth()`. This will return a `RemixClientAuth` object which you can use in your components. You can skip this part if you find it unnecessary and provide all your data through the loader (the next step), but we suggest having the client auth too and use it directly in your components to get OAuth, BuiltinUI and signout URLs.

```ts
// app/services/auth.ts

import createClientAuth, {
  type RemixAuthOptions,
} from "@gel/auth-remix/client";

export const options: RemixAuthOptions = {
  baseUrl: "http://localhost:3000",
  // ...
};

const auth = createClientAuth(options);

export default auth;
```

2. Initialize the server auth helper by passing an Gel `Client` object to `createServerAuth()`, along with configuration options. This will return a `RemixServerAuth` object which you can use across your app on the server side.

   ```ts
   // app/services/auth.server.ts

   import createServerAuth from "@gel/auth-remix/server";
   import { createClient } from "gel";
   import { options } from "./auth";

   export const client = createClient({
     //Note: when developing locally you will need to set tls  security to insecure, because the dev server uses  self-signed certificates which will cause api calls with the fetch api to fail.
     tlsSecurity: "insecure",
   });

   export const auth = createServerAuth(client, options);
   ```

   The available auth config options are as follows:

   - `baseUrl: string`, _required_, The url of your application; needed for various auth flows (eg. OAuth) to redirect back to.
   - `authRoutesPath?: string`, The path to the auth route handlers, defaults to `'auth'`, see below for more details.
   - `authCookieName?: string`, The name of the cookie where the auth token will be stored, defaults to `'gel-session'`.
   - `pkceVerifierCookieName?: string`: The name of the cookie where the verifier for the PKCE flow will be stored, defaults to `'gel-pkce-verifier'`
   - `passwordResetUrl?: string`: The url of the the password reset page; needed if you want to enable password reset emails in your app.

3. Setup the auth route handlers, with `auth.createAuthRouteHandlers()`. Callback functions can be provided to handle various auth events, where you can define what to do in the case of successful signin's or errors. You only need to configure callback functions for the types of auth you wish to use in your app.

   ```ts
   // app/routes/auth.$.ts

   import { redirect } from "@remix-run/node";
   import auth from "~/services/auth.server";

   export const { loader } = auth.createAuthRouteHandlers({
     async onOAuthCallback({ error, tokenData, provider, isSignUp }) {
       return redirect("/");
     },
     async onSignout() {
       return redirect("/");
     },
   });
   ```

   The currently available auth handlers are:

   - `onOAuthCallback`
   - `onBuiltinUICallback`
   - `onEmailVerify`
   - `onSignout`

   By default the handlers expect to exist under the `/routes/auth` path in your app, however if you want to place them elsewhere, you will also need to configure the `authRoutesPath` option of `createServerAuth` to match.

4. Now we just need to setup the UI to allow your users to sign in/up, etc. The easiest way to get started is to use the Gel Auth's builtin UI. Or alternatively you can implement your own custom UI.

   **Builtin UI**

   To use the builtin auth UI, first you will need to enable the UI in the auth ext configuration (see the auth ext docs for details). For the `redirect_to` and `redirect_to_on_signup` configuration options, set them to `{your_app_url}/auth/builtin/callback` and `{your_app_url}/auth/builtin/callback?isSignUp=true` respectively. (Note: if you have setup the auth route handlers under a custom path, replace `auth` in the above url with that path).

   Then you just need to configure the `onBuiltinUICallback` route handler to define what to do once the builtin ui redirects back to your app, and place a link to the builtin UI url returned by `auth.getBuiltinUIUrl()` somewhere in your app.

   **Custom UI**

   To help with implementing your own custom auth UI, the `auth` object has a number of methods you can use:

   - `emailPasswordSignUp`
   - `emailPasswordSignIn`
   - `emailPasswordResendVerificationEmail`
   - `emailPasswordSendPasswordResetEmail`
   - `emailPasswordResetPassword`
   - `signout`
   - `isPasswordResetTokenValid(resetToken: string)`: Checks if a password reset token is still valid.
   - `getOAuthUrl(providerName: string)`: This method takes the name of an OAuth provider (make sure you configure providers you need in the auth ext config first using CLI or Gel UI) and returns a link that will initiate the OAuth sign in flow for that provider. You will also need to configure the `onOAuthCallback` auth route handler.

## Usage

Now you have auth all configured and user's can signin/signup/etc. you can use the `auth.getSession()` method in your app pages to retrieve an `AuthSession` object. This session object allows you to check if the user is currently signed in with the `isSignedIn` method, and also provides a `Client` object automatically configured with the `ext::auth::client_token` global, so you can run queries using the `ext::auth::ClientTokenIdentity` of the currently signed in user.

```ts
// app/routes/_index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";

import auth, { client } from "~/services/auth.server";
import clientAuth from "~/services/auth.client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = auth.getSession(request);
  const isSignedIn = await session.isSignedIn();

  return json({
    isSignedIn,
  });
};

export default function Index() {
  const { isSignedIn } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Home</h1>
      {isSignedIn ? (
        <h2>You are logged in</h2>
      ) : (
        <>
          <h2>You are not logged in</h2>
          <Link to={clientAuth.getBuiltinUIUrl()}>Sign in with Builtin UI</Link>
        </>
      )}
    </main>
  );
}
```
