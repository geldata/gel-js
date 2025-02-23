import type { CryptoUtils } from "./utils";
import { cryptoUtils as browserCryptoUtils } from "./browserCrypto";

const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

let cryptoUtils: CryptoUtils;

function loadCrypto() {
  if (isNode) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:crypto");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cryptoUtils = require("./nodeCrypto").cryptoUtils;
    } catch (_) {
      if (typeof globalThis.crypto !== "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cryptoUtils = browserCryptoUtils;
      } else {
        throw new Error("No crypto implementation found");
      }
    }
  } else {
    cryptoUtils = browserCryptoUtils;
  }
}

loadCrypto();

export default cryptoUtils!;
