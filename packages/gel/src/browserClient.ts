import { BaseClientPool, Client, type ConnectOptions } from "./baseClient";
import { getConnectArgumentsParser } from "./conUtils";
import { cryptoUtils } from "./browserCrypto";
import { GelError } from "./errors";
import { FetchConnection } from "./fetchConn";
import { getHTTPSCRAMAuth } from "./httpScram";
import { Options } from "./options";

const parseConnectArguments = getConnectArgumentsParser(null);
const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

class FetchClientPool extends BaseClientPool {
  isStateless = true;
  _connectWithTimeout = FetchConnection.createConnectWithTimeout(httpSCRAMAuth);
}

export function createClient(): Client {
  throw new GelError(
    `'createClient()' cannot be used in browser (or edge runtime) environment, ` +
      `use 'createHttpClient()' API instead`,
  );
}

export function createHttpClient(
  options?: string | ConnectOptions | null,
): Client {
  return new Client(
    new FetchClientPool(
      parseConnectArguments,
      typeof options === "string" ? { dsn: options } : options ?? {},
    ),
    Options.defaults(),
  );
}
