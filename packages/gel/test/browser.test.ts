/**
 * @jest-environment ./test/jsdom-with-fetch.ts
 */

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
import { getGelVersion } from "./testbase";

const nodeVersion = parseInt(process.version.slice(1).split(".")[0], 10);

if (nodeVersion >= 15) {
  // @ts-ignore
  crypto.subtle = require("crypto").webcrypto.subtle;
}

const version = getGelVersion();

beforeAll(async () => {
  for (const nodeModule of [
    "assert",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "dns",
    "domain",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "worker_threads",
    "zlib",
  ]) {
    jest.mock(nodeModule, () => {
      throw new Error(`Cannot use node module '${nodeModule}' in browser`);
    });
  }
});

import { createClient, createHttpClient, GelError } from "../src/index.browser";

const brokenConnectOpts = JSON.parse(
  process.env._JEST_GEL_CONNECT_CONFIG || "",
);
const gelVersion = JSON.parse(process.env._JEST_GEL_VERSION!);

const connectOpts = {
  ...brokenConnectOpts,
  user: gelVersion.major >= 6 ? "admin" : "edgedb",
  tlsCAFile: undefined,
  tlsSecurity: "insecure",
};

// Skip tests on node < 15, since webcrypto api not available
if (nodeVersion >= 15) {
  test("createClient fails", () => {
    if (version.major < 2) return;
    expect(() => createClient()).toThrowError(GelError);
  });

  test("createHttpClient no options", async () => {
    if (version.major < 2) return;
    const client = createHttpClient();

    await expect(client.ensureConnected()).rejects.toThrowError(
      /no connection options specified/,
    );
  });

  test("basic queries", async () => {
    if (version.major < 2) return;
    const client = createHttpClient(connectOpts);

    expect(
      await client.querySingle(`select 'Querying from the ' ++ <str>$env`, {
        env: "browser",
      }),
    ).toEqual("Querying from the browser");
  });
} else {
  test.skip("skipping browser test", () => {
    // dummy test to satisfy jest
  });
}
