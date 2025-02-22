import { BaseClientPool, Client, type ConnectOptions } from "./baseClient";
import { parseConnectArguments } from "./conUtils.server";
import { Options } from "./options";
import { RawConnection } from "./rawConn";
import { FetchConnection } from "./fetchConn";
import { getHTTPSCRAMAuth } from "./httpScram";
import cryptoUtils from "./cryptoUtils";

class ClientPool extends BaseClientPool {
  isStateless = false;
  _connectWithTimeout = RawConnection.connectWithTimeout.bind(RawConnection);
}

export function createClient(options?: string | ConnectOptions | null): Client {
  return new Client(
    new ClientPool(
      parseConnectArguments,
      typeof options === "string" ? { dsn: options } : options ?? {},
    ),
    Options.defaults(),
  );
}

const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

class FetchClientPool extends BaseClientPool {
  isStateless = true;
  _connectWithTimeout = FetchConnection.createConnectWithTimeout(httpSCRAMAuth);
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
