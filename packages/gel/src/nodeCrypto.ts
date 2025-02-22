import crypto from "node:crypto";
import type { CryptoUtils } from "./utils";

function makeKey(keyBytes: Uint8Array): Promise<Uint8Array> {
  return Promise.resolve(keyBytes);
}

function randomBytes(size: number): Buffer {
  return crypto.randomBytes(size);
}

async function H(msg: Uint8Array): Promise<Buffer> {
  const sign = crypto.createHash("sha256");
  sign.update(msg);
  return sign.digest();
}

async function HMAC(
  key: Uint8Array | CryptoKey,
  msg: Uint8Array,
): Promise<Buffer> {
  const cryptoKey: Uint8Array | crypto.KeyObject =
    key instanceof Uint8Array ? key : crypto.KeyObject.from(key);
  const hm = crypto.createHmac("sha256", cryptoKey);
  hm.update(msg);
  return hm.digest();
}

export const cryptoUtils: CryptoUtils = {
  makeKey,
  randomBytes,
  H,
  HMAC,
};
