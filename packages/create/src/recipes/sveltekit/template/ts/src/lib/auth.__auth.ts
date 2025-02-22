import createClientAuth, { type AuthOptions } from "@gel/auth-sveltekit/client";

export const options: AuthOptions = {
  baseUrl: "http://localhost:5173",
};

const auth = createClientAuth(options);

export default auth;
