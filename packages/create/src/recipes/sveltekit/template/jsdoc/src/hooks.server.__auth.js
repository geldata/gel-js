import { redirect } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import serverAuth from "@gel/auth-sveltekit/server";
import { client } from "$lib/server/gel";
import { options } from "$lib/auth";

/** @type {import('@gel/auth-sveltekit/server').AuthRouteHandlers} */
const authRouteHandlers = {
  async onBuiltinUICallback({ error, tokenData, isSignUp }) {
    if (error) {
      //
    }

    if (!tokenData) {
      //
    }

    if (isSignUp) {
      //
    }

    redirect(303, "/");
  },

  async onSignout() {
    redirect(303, "/");
  },
};

const { createServerRequestAuth, createAuthRouteHook } = serverAuth(
  client,
  options,
);

export const handle = sequence(({ event, resolve }) => {
  event.locals.auth = createServerRequestAuth(event);

  return resolve(event);
}, createAuthRouteHook(authRouteHandlers));
