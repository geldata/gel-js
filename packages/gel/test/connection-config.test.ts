let mockFs = false;
let mockedFiles: { [key: string]: string } = {};
let homedir: string | null = null;

jest.mock("node:fs", () => {
  const actualFs = jest.requireActual("node:fs");

  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      access: async (filepath: string, ...args: any[]) => {
        if (!mockFs) return actualFs.promises.access(filepath, ...args);

        if (mockedFiles[filepath] === undefined) {
          throw new Error(`File doesn't exist`);
        }
      },
      readFile: async (filepath: string, ...args: any[]) => {
        if (!mockFs) return actualFs.promises.readFile(filepath, ...args);

        if (mockedFiles[filepath] !== undefined) {
          return mockedFiles[filepath];
        } else {
          const err = new Error(
            `ENOENT: no such file or directory, open '${filepath}'`,
          ) as any;
          err.errno = -2;
          err.code = "ENOENT";
          throw err;
        }
      },
      realpath: async (filepath: string, ...args: any[]) => {
        if (!mockFs) return actualFs.promises.realpath(filepath, ...args);

        return filepath;
      },
      stat: async (filepath: string, ...args: any[]) => {
        if (!mockFs) return actualFs.promises.stat(filepath, ...args);

        return { dev: 0 };
      },
    },
  };
});
jest.mock("node:os", () => {
  const actualOs = jest.requireActual("node:os");

  return {
    ...actualOs,
    homedir: () => {
      return homedir ?? actualOs.homedir();
    },
  };
});

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { join as pathJoin } from "node:path";
import { Duration } from "../src/index.node";
import { parseDuration } from "../src/conUtils";
import { parseConnectArguments, findStashPath } from "../src/conUtils.server";
import * as platform from "../src/platform";

function projectPathHash(projectPath: string): string {
  if (platform.isWindows && !projectPath.startsWith("\\\\")) {
    projectPath = "\\\\?\\" + projectPath;
  }

  return crypto.createHash("sha1").update(projectPath).digest("hex");
}

async function envWrap(
  {
    env,
    fs,
    captureWarnings = false,
  }: {
    env: ConnectionTestCase["env"];
    fs?: ConnectionTestCase["fs"];
    captureWarnings?: boolean;
  },
  func: () => Promise<unknown>,
): Promise<string[]> {
  let oldEnv: { [key: string]: any };
  let oldCwd: any;
  let oldWarn: any;
  const warnings: string[] = [];

  if (env) {
    oldEnv = process.env;
    process.env = env;
  }
  if (fs) {
    if (fs.cwd) {
      oldCwd = process.cwd;
      process.cwd = () => fs.cwd!;
    }
    if (fs.homedir) {
      homedir = fs.homedir;
    }
    if (fs.files) {
      mockedFiles = Object.entries(fs.files).reduce(
        (files, [path, content]) => {
          if (typeof content === "string") {
            files[path] = content;
          } else {
            const filepath = path.replace(
              "${HASH}",
              projectPathHash(content["project-path"]),
            );
            files[filepath] = "";
            for (const [name, file] of Object.entries(content)) {
              files[pathJoin(filepath, name)] = file;
            }
          }
          return files;
        },
        {} as { [key: string]: string },
      );
    }
  }
  if (captureWarnings) {
    oldWarn = console.warn;
    console.warn = (warning: string) => warnings.push(warning);
  }

  mockFs = true;
  try {
    await func();
  } finally {
    mockFs = false;
    if (env) {
      process.env = oldEnv!;
    }
    if (fs) {
      if (fs.cwd) {
        process.cwd = oldCwd!;
      }
      if (homedir) {
        homedir = null;
      }
      if (mockedFiles) {
        mockedFiles = {};
      }
    }
    if (captureWarnings) {
      console.warn = oldWarn;
    }
  }

  return warnings;
}

const errorMapping: { [key: string]: string | RegExp } = {
  credentials_file_not_found: /^cannot read credentials file/,
  project_not_initialised:
    /^Found project config file but the project is not initialized/,
  no_options_or_toml:
    /^no project config file found and no connection options specified either/,
  invalid_credentials_file: /^cannot read credentials file/,
  invalid_dsn_or_instance_name: /^invalid DSN or instance name/,
  invalid_instance_name: /^invalid instance name/,
  invalid_dsn: /^invalid DSN/,
  unix_socket_unsupported: /^unix socket paths not supported/,
  invalid_port: /^invalid port/,
  invalid_host: /^invalid host/,
  invalid_user: /^invalid user/,
  invalid_database: /^invalid database/,
  multiple_compound_opts:
    /^Cannot have more than one of the following connection options/,
  multiple_compound_env:
    /^Cannot have more than one of the following connection environment variables/,
  env_not_found: /environment variable '.*' doesn't exist/,
  file_not_found: /no such file or directory/,
  invalid_tls_security:
    /^invalid 'tlsSecurity' value|'tlsSecurity' value cannot be lower than security level set by GEL_CLIENT_SECURITY/,
  exclusive_options: /^Cannot specify both .* and .*|are mutually exclusive/,
  secret_key_not_found:
    /^Cannot connect to cloud instances without a secret key/,
  invalid_secret_key: /^Invalid secret key/,
};

const warningMapping: { [key: string]: string } = {
  docker_tcp_port: `GEL_PORT in 'tcp://host:port' format, so will be ignored`,
  gel_and_edgedb: `Both GEL_\w+ and EDGEDB_\w+ are set; EDGEDB_\w+ will be ignored`,
};

interface ConnectionResult {
  address: [string, number];
  database: string;
  user: string;
  password: string | null;
  tlsCAData: string | null;
  tlsSecurity: boolean;
  tlsServerName: string | null;
  serverSettings: { [key: string]: string };
  waitUntilAvailable: string;
}

type ConnectionTestCase = {
  opts?: { [key: string]: any };
  env?: { [key: string]: string };
  platform?: "windows" | "macos";
  fs?: {
    cwd?: string;
    homedir?: string;
    files?: {
      [key: string]:
        | string
        | {
            "instance-name": string;
            "project-path": string;
            "cloud-profile"?: string;
            database?: string;
            branch?: string;
          };
    };
  };
  warnings?: string[];
} & ({ result: ConnectionResult } | { error: { type: string } });

async function runConnectionTest(testcase: ConnectionTestCase): Promise<void> {
  const { env = {}, opts: _opts = {}, fs } = testcase;

  const opts = { ..._opts, instanceName: _opts.instance };

  if ("error" in testcase) {
    const error = errorMapping[testcase.error.type];
    if (!error) {
      throw new Error(`Unknown error type: ${testcase.error.type}`);
    }

    await expect(() =>
      envWrap({ env, fs }, () => parseConnectArguments(opts)),
    ).rejects.toThrow(error);
  } else {
    const warnings = await envWrap(
      { env, fs, captureWarnings: !!testcase.warnings },
      async () => {
        try {
          const { connectionParams } = await parseConnectArguments(opts);

          let waitMilli = connectionParams.waitUntilAvailable;
          const waitHours = Math.floor(waitMilli / 3_600_000);
          waitMilli -= waitHours * 3_600_000;
          const waitMinutes = Math.floor(waitMilli / 60_000);
          waitMilli -= waitMinutes * 60_000;
          const waitSeconds = Math.floor(waitMilli / 1000);
          waitMilli -= waitSeconds * 1000;

          expect({
            address: connectionParams.address,
            database: connectionParams.database,
            branch: connectionParams.branch,
            user: connectionParams.user,
            password: connectionParams.password ?? null,
            secretKey: connectionParams.secretKey ?? null,
            tlsServerName: connectionParams.tlsServerName ?? null,
            tlsCAData: connectionParams._tlsCAData,
            tlsSecurity: connectionParams.tlsSecurity,
            serverSettings: connectionParams.serverSettings,
            waitUntilAvailable: parseDuration(
              new Duration(
                0,
                0,
                0,
                0,
                waitHours,
                waitMinutes,
                waitSeconds,
                waitMilli,
              ),
            ),
          }).toEqual({
            ...testcase.result,
            waitUntilAvailable: parseDuration(
              testcase.result.waitUntilAvailable,
            ),
          });
        } catch (e) {
          throw new Error(
            `Failed testcase: ${JSON.stringify(testcase, null, 2)}`,
            { cause: e },
          );
        }
      },
    );
    if (testcase.warnings) {
      for (const warntype of testcase.warnings) {
        const warning = warningMapping[warntype];
        if (!warning) {
          throw new Error(`Unknown warning type: ${warntype}`);
        }
        expect(warnings).toContainEqual(warning);
      }
    }
  }
}

describe("parseConnectArguments", () => {
  let connectionTestcases: ConnectionTestCase[];
  try {
    connectionTestcases = JSON.parse(
      fs.readFileSync(
        "./test/shared-client-testcases/connection_testcases.json",
        "utf8",
      ),
    );
  } catch (err) {
    throw new Error(
      `Failed to read 'connection_testcases.json': ${err}.\n` +
        `Is the 'shared-client-testcases' submodule initialised? ` +
        `Try running 'git submodule update --init'.`,
    );
  }

  for (const [i, testcase] of connectionTestcases.entries()) {
    const { fs, platform } = testcase;
    if (fs && !platform && process.platform === "darwin") {
      const patchedFiles =
        testcase.fs?.files &&
        Object.entries(testcase.fs.files).reduce(
          (acc, [linuxPath, fileContent]) => {
            const macPath = linuxPathToMacOsPath(linuxPath);
            if (typeof fileContent === "string") {
              acc[macPath] = fileContent;
            } else {
              acc[macPath] = {
                "instance-name": fileContent["instance-name"],
                "project-path": linuxPathToMacOsPath(
                  fileContent["project-path"],
                ),
                ...(fileContent.database && { database: fileContent.database }),
                ...(fileContent.branch && { branch: fileContent.branch }),
                ...(fileContent["cloud-profile"] && {
                  "cloud-profile": fileContent["cloud-profile"],
                }),
              };
            }
            return acc;
          },
          {} as Record<
            string,
            | string
            | {
                "instance-name": string;
                "project-path": string;
                database?: string;
                branch?: string;
                "cloud-profile"?: string;
              }
          >,
        );
      const patchFs: ConnectionTestCase["fs"] = {
        cwd: testcase.fs?.cwd && linuxPathToMacOsPath(testcase.fs.cwd),
        homedir:
          testcase.fs?.homedir && linuxPathToMacOsPath(testcase.fs.homedir),
        files: patchedFiles,
      };
      const patchedTestcase = {
        ...testcase,
        env: {
          ...testcase.env,
          ...Object.entries(testcase.env ?? {}).reduce(
            (acc, [key, value]) => {
              return {
                ...acc,
                [key]: linuxPathToMacOsPath(value as string),
              };
            },
            {} as Record<string, string>,
          ),
        },
        opts: {
          ...testcase.opts,
          ...(testcase.opts?.dsn && {
            dsn: linuxPathToMacOsPath(testcase.opts.dsn),
          }),
          ...(testcase.opts?.tlsCAFile && {
            tlsCAFile: linuxPathToMacOsPath(testcase.opts.tlsCAFile),
          }),
          ...(testcase.opts?.credentialsFile && {
            credentialsFile: linuxPathToMacOsPath(
              testcase.opts.credentialsFile,
            ),
          }),
        },
        fs: patchFs,
      };

      test(`shared client test: index={${i}} patched for macos`, async () => {
        await runConnectionTest(patchedTestcase);
      });
    } else if (
      fs &&
      ((!platform && process.platform === "win32") ||
        (platform === "windows" && process.platform !== "win32") ||
        (platform === "macos" && process.platform !== "darwin"))
    ) {
      test.skip(`shared client test: index={${i}}`, async () => {
        // skipping unsupported platform test
      });
    } else {
      test(`shared client test: index={${i}}`, async () => {
        await runConnectionTest(testcase);
      });
    }
  }
});

const platformNames: { [key: string]: string } = {
  windows: "win32",
  macos: "darwin",
  linux: "linux",
};

test("project path hashing", async () => {
  let hashingTestcases: {
    platform: string;
    homeDir: string;
    env?: {
      [key: string]: string;
    };
    project: string;
    result: string;
  }[];
  try {
    hashingTestcases = JSON.parse(
      fs.readFileSync(
        "./test/shared-client-testcases/project_path_hashing_testcases.json",
        "utf8",
      ),
    );
  } catch (err) {
    throw new Error(
      `Failed to read 'project_path_hashing_testcases.json': ${err}.\n` +
        `Is the 'shared-client-testcases' submodule initialised? ` +
        `Try running 'git submodule update --init'.`,
    );
  }

  for (const testcase of hashingTestcases) {
    if (platformNames[testcase.platform] === process.platform) {
      await envWrap(
        { env: testcase.env ?? {}, fs: { homedir: testcase.homeDir } },
        async () =>
          expect(await findStashPath(testcase.project)).toBe(testcase.result),
      );
    }
  }
});

test("logging, inProject, fromProject, fromEnv", async () => {
  const defaults = {
    address: ["localhost", 5656],
    database: "edgedb",
    user: "edgedb",
    password: null,
    tlsCAData: null,
    tlsSecurity: "strict",
    tlsServerName: null,
    serverSettings: {},
  };

  for (const testcase of [
    {
      opts: { host: "localhost", user: "user", logging: false },
      result: { ...defaults, user: "user" },
      logging: false,
      inProject: false,
      fromProject: false,
      fromEnv: false,
    },
    // fromEnv: true - should take into account env vars
    {
      opts: { user: "user" },
      env: {
        EDGEDB_DATABASE: "testdb",
        EDGEDB_PASSWORD: "passw",
        EDGEDB_HOST: "host",
        EDGEDB_PORT: "123",
      },
      result: {
        ...defaults,
        address: ["host", 123],
        user: "user",
        database: "testdb",
        password: "passw",
      },
      logging: true,
      inProject: false,
      fromProject: false,
      fromEnv: true,
    },
    {
      opts: { user: "user" },
      env: {
        GEL_DATABASE: "testdb",
        GEL_PASSWORD: "passw",
        GEL_HOST: "host",
        GEL_PORT: "123",
      },
      result: {
        ...defaults,
        address: ["host", 123],
        user: "user",
        database: "testdb",
        password: "passw",
      },
      logging: true,
      inProject: false,
      fromProject: false,
      fromEnv: true,
    },
    // fromEnv: false - should not take into account env vars
    {
      opts: { dsn: "edgedb://", user: "user" },
      env: {
        EDGEDB_DATABASE: "testdb",
        EDGEDB_PASSWORD: "passw",
        EDGEDB_HOST: "host",
        EDGEDB_PORT: "123",
      },
      result: {
        ...defaults,
        user: "user",
      },
      logging: true,
      inProject: false,
      fromProject: false,
      fromEnv: false,
    },
    {
      opts: { dsn: "gel://", user: "user" },
      env: {
        GEL_DATABASE: "testdb",
        GEL_PASSWORD: "passw",
        GEL_HOST: "host",
        GEL_PORT: "123",
      },
      result: {
        ...defaults,
        user: "user",
      },
      logging: true,
      inProject: false,
      fromProject: false,
      fromEnv: false,
    },
    // Considers credentials file, environment variables, and inline options in
    // order of precedence: credentials file < environment variables < inline
    // options, where each level overrides the one before it.
    {
      opts: { user: "user" },
      env: {
        EDGEDB_DATABASE: "testdb",
        EDGEDB_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/edgedb.toml": "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158":
            "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158/instance-name":
            "test_project",
          "/home/edgedb/.config/edgedb/credentials/test_project.json":
            '{"port": 10702, "user": "test3n", "password": "lZTBy1RVCfOpBAOwSCwIyBIR", "database": "test3n"}',
        },
      },
      result: {
        ...defaults,
        address: ["localhost", 10702],
        user: "user",
        database: "testdb",
        password: "passw",
      },
      logging: true,
      inProject: true,
      fromProject: true,
      fromEnv: true,
    },
    {
      opts: { user: "user" },
      env: {
        GEL_DATABASE: "testdb",
        GEL_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/gel.toml": "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158":
            "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158/instance-name":
            "test_project",
          "/home/edgedb/.config/edgedb/credentials/test_project.json":
            '{"port": 10702, "user": "test3n", "password": "lZTBy1RVCfOpBAOwSCwIyBIR", "database": "test3n"}',
        },
      },
      result: {
        ...defaults,
        address: ["localhost", 10702],
        user: "user",
        database: "testdb",
        password: "passw",
      },
      logging: true,
      inProject: true,
      fromProject: true,
      fromEnv: true,
    },
    // Considers credentials file and inline options. Inline options
    // have higher precedence and ovverride config from the file.
    {
      opts: { user: "user", database: "db", password: "secret" },
      env: {
        EDGEDB_DATABASE: "testdb",
        EDGEDB_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/edgedb.toml": "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158":
            "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158/instance-name":
            "test_project",
          "/home/edgedb/.config/edgedb/credentials/test_project.json":
            '{"port": 10702, "user": "test3n", "password": "lZTBy1RVCfOpBAOwSCwIyBIR", "database": "test3n"}',
        },
      },
      result: {
        ...defaults,
        address: ["localhost", 10702],
        user: "user",
        database: "db",
        password: "secret",
      },
      logging: true,
      inProject: true,
      fromProject: true,
      fromEnv: false,
    },
    {
      opts: { user: "user", database: "db", password: "secret" },
      env: {
        GEL_DATABASE: "testdb",
        GEL_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/gel.toml": "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158":
            "",
          "/home/edgedb/.config/edgedb/projects/test-cf3c86df8fc33fbb73a47671ac5762eda8219158/instance-name":
            "test_project",
          "/home/edgedb/.config/edgedb/credentials/test_project.json":
            '{"port": 10702, "user": "test3n", "password": "lZTBy1RVCfOpBAOwSCwIyBIR", "database": "test3n"}',
        },
      },
      result: {
        ...defaults,
        address: ["localhost", 10702],
        user: "user",
        database: "db",
        password: "secret",
      },
      logging: true,
      inProject: true,
      fromProject: true,
      fromEnv: false,
    },
    // Considers inline options only. Config from the file and env vars is ignored.
    {
      opts: { host: "test.local" },
      env: {
        EDGEDB_DATABASE: "testdb",
        EDGEDB_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/edgedb.toml": "",
        },
      },
      result: {
        ...defaults,
        address: ["test.local", 5656],
      },
      logging: true,
      inProject: true,
      fromProject: false,
      fromEnv: false,
    },
    {
      opts: { host: "test.local" },
      env: {
        GEL_DATABASE: "testdb",
        GEL_PASSWORD: "passw",
      },
      fs: {
        cwd: "/home/edgedb/test",
        homedir: "/home/edgedb",
        files: {
          "/home/edgedb/test/gel.toml": "",
        },
      },
      result: {
        ...defaults,
        address: ["test.local", 5656],
      },
      logging: true,
      inProject: true,
      fromProject: false,
      fromEnv: false,
    },
  ]) {
    if (
      testcase.fs &&
      (process.platform === "win32" || process.platform === "darwin")
    ) {
      continue;
    }

    await envWrap(
      { env: testcase.env as any, fs: testcase.fs as any },
      async () => {
        const { connectionParams, logging, inProject, fromProject, fromEnv } =
          await parseConnectArguments(testcase.opts);
        expect({
          address: connectionParams.address,
          database: connectionParams.database,
          user: connectionParams.user,
          password: connectionParams.password ?? null,
          tlsCAData: connectionParams._tlsCAData,
          tlsServerName: connectionParams.tlsServerName ?? null,
          tlsSecurity: connectionParams.tlsSecurity,
          serverSettings: connectionParams.serverSettings,
        }).toEqual(testcase.result);
        expect(logging).toEqual(testcase.logging);
        expect(await inProject()).toEqual(testcase.inProject);
        expect(fromProject).toEqual(testcase.fromProject);
        expect(fromEnv).toEqual(testcase.fromEnv);
      },
    );
  }
});

// Checks if _tlsSecurity is correctly set up based on env vars and inline
// options for CLIENT_SECURITY and CLIENT_TLS_SECURITY.
test("GEL_CLIENT_SECURITY env var", async () => {
  const truthTable: [string, string, string | null][] = [
    // CLIENT_SECURITY, CLIENT_TLS_SECURITY, result
    ["default", "default", "default"],
    ["default", "insecure", "insecure"],
    ["default", "no_host_verification", "no_host_verification"],
    ["default", "strict", "strict"],
    ["insecure_dev_mode", "default", "insecure"],
    ["insecure_dev_mode", "insecure", "insecure"],
    ["insecure_dev_mode", "no_host_verification", "no_host_verification"],
    ["insecure_dev_mode", "strict", "strict"],
    ["strict", "default", "strict"],
    ["strict", "insecure", null],
    ["strict", "no_host_verification", null],
    ["strict", "strict", "strict"],
  ];

  for (const [clientSecurity, clientTlsSecurity, result] of truthTable) {
    await envWrap(
      {
        env: {
          GEL_CLIENT_SECURITY: clientSecurity,
        },
      },
      async () => {
        const parseConnectArgs = parseConnectArguments({
          host: "localhost",
          tlsSecurity: clientTlsSecurity as any,
        });
        if (!result) {
          await expect(parseConnectArgs).rejects.toThrow();
        } else {
          const { connectionParams } = await parseConnectArgs;
          expect(connectionParams._tlsSecurity).toBe(result);
        }
      },
    );
  }
});

function linuxPathToMacOsPath(linuxPath: string): string {
  return linuxPath
    .replace("/home/edgedb", "/Users/edgedb")
    .replace("/.config/edgedb", "/Library/Application Support/edgedb");
}
