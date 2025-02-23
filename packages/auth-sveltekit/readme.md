# @gel/auth-sveltekit

This library provides a set of utilities to help you integrate authentication into your [SvelteKit](https://kit.svelte.dev/) application.
It supports authentication with various OAuth providers, as well as email/password authentication.

## Installation

This package is published on npm and can be installed with your package manager of choice.

```bash
npm install @gel/auth-sveltekit
```

## Setup

**Prerequisites**:

- Node v18+
  - **Note**: Due to using the `crypto` global, you will need to start Node with `--experimental-global-webcrypto`. You can add this option to your `NODE_OPTIONS` environment variable, like `NODE_OPTIONS='--experimental-global-webcrypto'` in the appropriate `.env` file.
- Before adding Gel auth to your SvelteKit app, you will first need to enable the `auth` extension in your Gel schema, and have configured the extension with some providers (you can do this in CLI or Gel UI). Refer to the auth extension docs for details on how to do this.

### Client auth helper

Initialize the client auth helper by passing configuration options to `createClientAuth()`. This will return a `ClientAuth` object which you can use in your components. You can skip this part if you find it unnecessary and provide all your data through the load functions (the next step), but we suggest having the client auth too and use it directly in your components to get OAuth, BuiltinUI and signout URLs.

```ts
// src/lib/auth.ts

import createClientAuth, { type AuthOptions } from "@gel/auth-sveltekit/client";

export const options: AuthOptions = {
  baseUrl: "http://localhost:5173",
  // ...
};

const auth = createClientAuth(options);

export default auth;
```

The available auth config options are as follows:

- `baseUrl: string`, _required_, The url of your application; needed for various auth flows (eg. OAuth) to redirect back to.
- `authRoutesPath?: string`, The path to the auth route handlers, defaults to `'auth'`, see below for more details.
- `authCookieName?: string`, The name of the cookie where the auth token will be stored, defaults to `'gel-session'`.
- `pkceVerifierCookieName?: string`: The name of the cookie where the verifier for the PKCE flow will be stored, defaults to `'gel-pkce-verifier'`
- `passwordResetUrl?: string`: The url of the the password reset page; needed if you want to enable password reset emails in your app.
  &nbsp;

### Gel client

Lets create an Gel client that you will need for creating server auth client.

```ts
// src/lib/server/auth.ts
import { createClient } from "gel";

export const client = createClient({
  //Note: when developing locally you will need to set tls  security to insecure, because the dev server uses  self-signed certificates which will cause api calls with the fetch api to fail.
  tlsSecurity: "insecure",
});
```

### Server auth client

Create the server auth client in a handle hook. Firstly call `serverAuth` passing to it Gel client you created in the previous step, along with configuration options from step 1. This will give you back the `createServerRequestAuth` and `createAuthRouteHook`. You should call `createServerRequestAuth` inside a handle to attach the server client to `event.locals`. Calling `createAuthRouteHook` will give you back a hook so you should just invoke it inside `sequence` and pass your auth route handlers to it.
You can now access the server auth in all actions and load functions through `event.locals`.

```ts
// src/hooks.server.ts
import serverAuth, {
  type AuthRouteHandlers,
} from "@edgedb/auth-sveltekit/server";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { client } from "$lib/server/auth";
import { createUser } from "$lib/server/utils";
import { options } from "$lib/auth";

const { createServerRequestAuth, createAuthRouteHook } = serverAuth(
  client,
  options,
);

const createServerAuthClient: Handle = ({ event, resolve }) => {
  event.locals.auth = createServerRequestAuth(event); // (*)

  return resolve(event);
};

// You only need to configure callback functions for the types of auth you wish to use in your app. (**)
const authRouteHandlers: AuthRouteHandlers = {
  async onOAuthCallback({ error, tokenData, provider, isSignUp }) {
    redirect(303, "/");
  },
  onSignout() {
    redirect("/");
  },
};

export const handle = sequence(
  createServerAuthClient,
  createAuthRouteHook(authRouteHandlers),
);
```

\* If you use typescript you need to update `Locals` type with `auth` so that auth is correctly recognized throughout the project:

```ts
import type { ServerRequestAuth } from "@gel/auth-sveltekit/server";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth: ServerRequestAuth;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
```

\*\* The currently available auth route handlers are:

- `onOAuthCallback`
- `onBuiltinUICallback`
- `onEmailVerify`
- `onSignout`

In any of them you can define what to do in case of success or error. Every handler should return a redirect call.

### UI

Now we just need to setup the UI to allow your users to sign in/up, etc. The easiest way to get started is to use the Gel Auth's builtin UI. Or alternatively you can implement your own custom UI.

**Builtin UI**

To use the builtin auth UI, first you will need to enable the UI in the auth ext configuration (see the auth ext docs for details). For the `redirect_to` and `redirect_to_on_signup` configuration options, set them to `{your_app_url}/auth/builtin/callback` and `{your_app_url}/auth/builtin/callback?isSignUp=true` respectively. (Note: if you have setup the auth route handlers under a custom path, replace `auth` in the above url with that path).

Then you just need to configure the `onBuiltinUICallback` route handler to define what to do once the builtin ui redirects back to your app, and place a link to the builtin UI url returned by `auth.getBuiltinUIUrl()` somewhere in your app.

**Custom UI**

To help with implementing your own custom auth UI, the `auth` object has a number of methods you can use:

- `emailPasswordSignUp(data: { email: string; password: string } | FormData)`
- `emailPasswordSignIn(data: { email: string; password: string } | FormData)`
- `emailPasswordResendVerificationEmail(data: { verification_token: string } | FormData)`
- `emailPasswordSendPasswordResetEmail(data: { email: string } | FormData)`
- `emailPasswordResetPassword(data: { reset_token: string; password: string } | FormData)`
- `signout()`
- `isPasswordResetTokenValid(resetToken: string)`: Checks if a password reset token is still valid.
- `getOAuthUrl(providerName: string)`: This method takes the name of an OAuth provider (make sure you configure providers you need in the auth ext config first using CLI or Gel UI) and returns a link that will initiate the OAuth sign in flow for that provider. You will also need to configure the `onOAuthCallback` auth route handler.

## Usage

Now you have auth configured and users can signin/signup/etc. You can use the `locals.auth.session` in server files to retrieve an `AuthSession` object. This session object allows you to check if the user is currently signed in with the `isSignedIn` method, and also provides a `Client` object automatically configured with the `ext::auth::client_token` global, so you can run queries using the `ext::auth::ClientTokenIdentity` of the currently signed in user.

```ts
// src/routes/+page.server.ts
import { fail, type Actions } from "@sveltejs/kit";

export async function load({ locals }) {
  const session = locals.auth.session;
  const isSignedIn = await session.isSignedIn();

  return {
    isSignedIn,
  };
}
```

```svelte
<!-- src/routes/+page.svelte -->
<script>
  import clientAuth from "$lib/auth";

  export let data;
</script>

<div>
  {#if data.isSignedIn}
    <h2>You are logged in!</h2>
  {:else}
    <h2>You are not logged in.</h2>
    <a href={clientAuth.getBuiltinUIUrl()}>Sign in with Builtin UI</a>
  {/if}
</div>
```
