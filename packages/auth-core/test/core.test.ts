import crypto from "node:crypto";
import { getClient } from "@repo/test-utils";

import { Auth } from "../src/core";

const SIGNING_KEY = crypto.randomBytes(32).toString("base64");

beforeAll(async () => {
  const client = getClient();

  try {
    await client.execute(`
    create extension pgcrypto;
    create extension auth;

    configure current database set
      ext::auth::AuthConfig::auth_signing_key := '${SIGNING_KEY}';

    configure current database set
      ext::auth::AuthConfig::token_time_to_live := <duration>'24 hours';

    configure current database set
      ext::auth::SMTPConfig::sender := 'noreply@example.geldata.com';

    configure current database
      insert ext::auth::EmailPasswordProviderConfig {};
  `);

    // wait for config to be applied
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally {
    client.close();
  }
}, 20_000);

test("test password signup/signin flow", async () => {
  const client = getClient({ tlsSecurity: "insecure" });
  try {
    const auth = await Auth.create(client);

    const signupResponse = await auth.signupWithEmailPassword(
      "test@example.geldata.com",
      "supersecretpassword",
      `${auth.baseUrl}/auth/emailpassword/verify`,
    );

    expect(signupResponse.status).toBe("verificationRequired");
    expect(typeof signupResponse.verifier).toBe("string");

    await expect(
      auth.signinWithEmailPassword(
        "test@example.geldata.com",
        "supersecretpassword",
      ),
    ).rejects.toThrow("Email verification is required");
  } finally {
    await client.close();
  }
});
