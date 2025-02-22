import createClientAuth from "@gel/auth-sveltekit/client";

export const options = {
  baseUrl: "http://localhost:5173",
};

const auth = createClientAuth(options);

export default auth;
