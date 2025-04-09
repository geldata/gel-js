import { spawn } from "node:child_process";
import * as process from "node:process";
import * as child_process from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import * as readline from "node:readline";
import {
  type Client,
  createClient,
  type ConnectConfig,
  type ConnectOptions,
} from "gel";

export interface GelVersion {
  major: number;
  minor: number;
  stage: string;
  stage_no: number;
}

export type { ConnectConfig };

interface ServerInfo {
  port: number;
  socket_dir: string;
  tls_cert_file?: string;
}

export const getServerInfo = async (
  filename: string,
): Promise<ServerInfo | null> => {
  if (!fs.existsSync(filename)) {
    return null;
  }

  const input = fs.createReadStream(filename);
  const rl = readline.createInterface({ input });

  let line: string | null = null;
  for await (line of rl) {
    if (line.startsWith("READY=")) {
      break;
    }
  }

  if (!line) {
    throw new Error("no data found in " + filename);
  }

  return JSON.parse(line.replace("READY=", ""));
};

const awaitServerInfo = async (statusFile: string) => {
  let serverInfo: ServerInfo | null = null;
  for (let i = 0; i < 1000; i++) {
    serverInfo = await getServerInfo(statusFile);

    if (serverInfo == null) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } else {
      break;
    }
  }

  if (serverInfo == null) {
    throw new Error("could not open server status file " + statusFile);
  }

  return serverInfo;
};

export const getWSLPath = (wslPath: string): string => {
  return wslPath
    .replace(/^([a-z]):/i, "/mnt/$1")
    .split("\\")
    .join("/")
    .toLowerCase();
};

const generateTempID = (): number => {
  return Math.floor(Math.random() * 999999999);
};

export const generateStatusFileName = (tag: string): string => {
  return path.join(
    os.tmpdir(),
    `gel-js-status-file-${tag}-${generateTempID()}`,
  );
};

export const getServerCommand = (
  statusFile: string,
  strictSecurity = true,
): { args: string[]; availableFeatures: string[] } => {
  const availableFeatures: string[] = [];

  // we can check version here and use gel-server for newer versions
  // but edgedb-server works for all versions
  const srvcmd = process.env.GEL_SERVER_BIN || "edgedb-server";

  let args = [srvcmd];
  if (process.platform === "win32") {
    args = ["wsl", "-u", "gel", ...args];
  }

  const helpCmd = [...args, "--help"];
  console.log("Spawning child process with command:", helpCmd.join(" "));
  const help = child_process
    .spawnSync(srvcmd, helpCmd.slice(1))
    .stdout.toString();

  if (help.includes("--tls-cert-mode")) {
    args.push("--tls-cert-mode=generate_self_signed");
  } else if (help.includes("--generate-self-signed-cert")) {
    args.push("--generate-self-signed-cert");
  }

  if (help.includes("--auto-shutdown-after")) {
    args.push("--auto-shutdown-after=0");
  } else {
    args.push("--auto-shutdown");
  }

  if (help.includes("--admin-ui")) {
    args.push("--http-endpoint-security=optional");
    args.push("--jose-key-mode=generate");

    availableFeatures.push("binary-over-http");
  }

  args = [
    ...args,
    "--bind-address=127.0.0.1",
    "--bind-address=::1", // deno on some platforms resolves localhost to ::1
    "--temp-dir",
    "--testmode",
    "--port=auto",
    "--emit-server-status=" + statusFile,
    `--security=${strictSecurity ? "strict" : "insecure_dev_mode"}`,
    "--bootstrap-command=ALTER ROLE edgedb { SET password := 'edgedbtest' }",
  ];
  return { args, availableFeatures };
};

interface ServerInst {
  config: ConnectConfig;
  proc: child_process.ChildProcess;
}

export const startServer = async (
  cmd: string[],
  statusFile: string,
  env: Record<string, string> = {},
): Promise<ServerInst> => {
  if (process.env.GEL_DEBUG_SERVER) {
    console.log(`running command: ${cmd.join(" ")}`);
  }

  const maybeEnvWithDevMode =
    process.env.GEL_SERVER_BIN || process.env.CI
      ? {}
      : {
          __EDGEDB_DEVMODE: "1",
        };

  const proc = child_process.spawn(cmd[0], cmd.slice(1), {
    env: { ...process.env, ...env, ...maybeEnvWithDevMode },
  });

  try {
    if (process.env.GEL_DEBUG_SERVER) {
      proc.stdout.on("data", (data) => {
        process.stdout.write(data.toString());
      });
    }

    let stderrData = "";
    proc.stderr.on("data", (data) => {
      if (process.env.GEL_DEBUG_SERVER) {
        process.stderr.write(data.toString());
      } else {
        stderrData += data;
      }
    });

    const runtimeData = await Promise.race([
      awaitServerInfo(statusFile),
      new Promise<never>((_, reject) => {
        proc.addListener("exit", (code, signal) => {
          if (stderrData) {
            console.log("--- Gel output start ---");
            console.log(stderrData);
            console.log("--- Gel output end ---");
          }
          reject(
            `Gel exited prematurely with ` + `code ${code} or signal ${signal}`,
          );
        });
      }),
    ]);
    proc.removeAllListeners("exit");

    if (runtimeData.tls_cert_file && process.platform === "win32") {
      const tmpFile = path.join(
        os.tmpdir(),
        `edbtlscert-${generateTempID()}.pem`,
      );
      const cmd = `wsl -u edgedb cp ${runtimeData.tls_cert_file} ${getWSLPath(
        tmpFile,
      )}`;
      child_process.execSync(cmd);
      runtimeData.tls_cert_file = tmpFile;
    }

    const config: ConnectConfig = {
      host: "localhost",
      port: runtimeData.port,
      user: "edgedb",
      password: "edgedbtest",
      tlsSecurity: "no_host_verification",
    };

    if (typeof runtimeData.tls_cert_file === "string") {
      config.tlsCAFile = runtimeData.tls_cert_file;
    }

    return { config, proc };
  } catch (err) {
    proc.kill();
    throw err;
  }
};

export const connectToServer = async (
  config: ConnectConfig,
): Promise<{ client: Client; version: GelVersion }> => {
  const client = createClient(config);

  let version: GelVersion;
  try {
    await client.execute(`
      CREATE DATABASE jest;
		`);

    await client.execute(`
      CREATE SUPERUSER ROLE jest {
        SET password := "jestjest";
      };
		`);

    await client.execute(`
      CONFIGURE INSTANCE INSERT Auth {
        user := "jest",
        priority := 10,
        method := (INSERT SCRAM),
      };
    `);

    version = await client.queryRequiredSingle(`select sys::get_version()`);
  } catch (e) {
    await client.close();
    throw e;
  }

  return { client, version };
};

export const shutdown = async (
  proc: child_process.ChildProcess,
  client: Client,
) => {
  await client.close();

  await new Promise<void>((resolve, reject) => {
    let timedout = false;
    const to = setTimeout(() => {
      console.error("!!! Gel exit timeout... !!!");
      timedout = true;

      proc.kill("SIGTERM");
    }, 15_000);

    proc.on("exit", (code: number, signal: string) => {
      clearTimeout(to);
      if (signal === "SIGTERM" || code !== 0 || timedout) {
        reject(new Error("gel did not shutdown gracefully"));
      } else {
        resolve();
      }
    });

    proc.on("error", (error: Error) => {
      clearTimeout(to);
      reject(error);
    });
  });
};

export async function applyMigrations(
  config: ConnectConfig,
  params?: { flags?: string[] },
) {
  console.log("\nApplying migrations...");

  if (process.platform === "win32") {
    await runCommand("wsl", [
      "-u",
      "edgedb",
      "env",
      ...Object.entries(configToEnv(config)).map(
        ([key, val]) => `${key}=${val}`,
      ),
      "edgedb",
      "migrate",
      ...(params?.flags || []),
      "--schema-dir",
      getWSLPath(path.join(process.cwd(), "dbschema")),
    ]);
  } else {
    await runCommand(
      "edgedb",
      ["migrate", ...(params?.flags || [])],
      configToEnv(config),
    );
  }
}

export async function generateQB(config: ConnectConfig) {
  console.log(`\nGenerating query builder...`);

  await runCommand(
    "yarn",
    ["generate", "edgeql-js", "--force-overwrite"],
    configToEnv(config),
  );
}

export async function generateQueries(config: ConnectConfig) {
  console.log(`\nGenerating queries...`);
  await runCommand(
    "yarn",
    ["generate", "queries", "--file"],
    configToEnv(config),
  );
}

export async function runCommand(
  command: string,
  args: string[] = [],
  env?: Record<string, string | undefined>,
): Promise<void> {
  const proc = spawn(command, args, {
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
    env: {
      ...process.env,
      ...env,
    },
  });

  return new Promise<void>((resolve, reject) => {
    proc.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          `Command '${command} ${args.join(" ")}' exited with code: ${code}`,
        );
      }
    });
    proc.once("error", (err) => {
      proc.removeAllListeners("exit");
      reject(err);
    });
  });
}

export function configToEnv(
  config: ConnectConfig,
): Record<string, string | undefined> {
  return {
    GEL_HOST: config.host,
    GEL_PORT: config.port?.toString(),
    GEL_DATABASE: config.database,
    GEL_USER: config.user,
    GEL_PASSWORD: config.password,
    // GEL_TLS_CA_FILE: config.tlsCAFile,
    // GEL_CLIENT_TLS_SECURITY: config.tlsSecurity,
    GEL_CLIENT_SECURITY: "insecure_dev_mode",
  };
}

function _getOpts(opts: ConnectOptions): ConnectOptions {
  let config;
  try {
    config = JSON.parse(process.env._JEST_GEL_CONNECT_CONFIG || "");
  } catch {
    throw new Error("Gel Jest test environment is not initialized");
  }
  if (!opts.user) {
    opts.user = "jest";
    opts.password = "jestjest";
  }
  if (!opts.database) {
    opts.database = "jest";
  }
  return { ...config, ...opts };
}

export function getConnectOptions(): ConnectOptions {
  return _getOpts({});
}

export function getClient(opts: ConnectOptions = {}): Client {
  return createClient(_getOpts(opts));
}

export function getAvailableFeatures(): Set<string> {
  return new Set(JSON.parse(process.env._JEST_GEL_AVAILABLE_FEATURES!));
}

export function getGelVersion(): GelVersion {
  return JSON.parse(process.env._JEST_GEL_VERSION!);
}

export function getAvailableExtensions(): Map<
  string,
  { major: number; minor: number }
> {
  return new Map(JSON.parse(process.env._JEST_GEL_AVAILABLE_EXTENSIONS!));
}

/**
 * A function that will attempt to call a promise until it resolves or the timeout is reached.
 * @param promise - The promise to call.
 * @param timeout - The timeout in milliseconds.
 * @param interval - The interval in milliseconds between attempts, this will be an exponential backoff.
 * @returns The result of the promise.
 */
export async function waitFor<T>(
  promise: () => Promise<T>,
  timeout: number,
  interval: number,
): Promise<T> {
  const startTime = Date.now();
  let attempts = 0;
  while (true) {
    try {
      return await promise();
    } catch (_error) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout after ${timeout}ms`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, interval * Math.pow(2, attempts)),
      );
      attempts++;
    }
  }
}