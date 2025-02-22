import type { CryptoUtils } from "./utils";

async function makeKey(key: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    key,
    {
      name: "HMAC",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"],
  );
}

function randomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

async function H(msg: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", msg));
}

async function HMAC(
  key: Uint8Array | CryptoKey,
  msg: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey =
    key instanceof Uint8Array ? ((await makeKey(key)) as CryptoKey) : key;
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, msg));
}

export const cryptoUtils: CryptoUtils = {
  makeKey,
  randomBytes,
  H,
  HMAC,
};
