import createAuth from "@gel/auth-nextjs/pages/client";

export const options = {
  baseUrl: "http://localhost:3000",
};

export const auth = createAuth(options);
