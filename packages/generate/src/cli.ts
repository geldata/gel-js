#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { Command, Option } from "@commander-js/extra-typings";
import { systemUtils, type Client, createClient, createHttpClient } from "gel";
import * as TOML from "@iarna/toml";

import { type ConnectConfig, isValidTlsSecurityValue } from "gel/dist/conUtils";
import { parseConnectArguments } from "gel/dist/conUtils.server";
import {
  type CommandOptions,
  promptForPassword,
  readPasswordFromStdin,
} from "./commandutil";
import { generateQueryBuilder } from "./edgeql-js";
import { runInterfacesGenerator } from "./interfaces";
import { type Target, exitWithError } from "./genutil";
import { generateQueryFiles } from "./queries";
import { runGelPrismaGenerator } from "./gel-prisma";

const { readFileUtf8, exists } = systemUtils;

const TLS_CHOICES = [
  "insecure",
  "no_host_verification",
  "strict",
  "default",
] as const;
type TlsSecurity = (typeof TLS_CHOICES)[number];

interface BaseCliOptions {
  instance?: string;
  dsn?: string;
  credentialsFile?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: boolean;
  passwordFromStdin?: boolean;
  tlsCaFile?: string;
  tlsSecurity?: TlsSecurity;
  useHttpClient?: boolean;
  useResolvedCodecType?: boolean;
  forceOverwrite?: boolean;
  updateIgnoreFile?: boolean; // set via --no-update-ignore-file
  future?: boolean;
  futureStrictTypeNames?: boolean;
  futurePolymorphismAsDiscriminatedUnions?: boolean;
}

interface EdgeqlJsOptions extends BaseCliOptions {
  target?: Target;
  out?: string;
  outputDir?: string; // alias for out
}

interface QueriesOptions extends BaseCliOptions {
  target?: Target;
  file?: string | true; // optional value; true means flag present without value
}

interface InterfacesOptions extends BaseCliOptions {
  file?: string;
}

interface PrismaOptions extends BaseCliOptions {
  file?: string;
}

async function findProjectRootAndSchemaDir() {
  let projectRoot: string | null = null;
  let currentDir = process.cwd();
  let schemaDir = "dbschema";
  const systemRoot = path.parse(currentDir).root;
  while (currentDir !== systemRoot) {
    const gelToml = path.join(currentDir, "gel.toml");
    const edgedbToml = path.join(currentDir, "edgedb.toml");
    let configFile: string | null = null;

    if (await exists(gelToml)) {
      configFile = gelToml;
    } else if (await exists(edgedbToml)) {
      configFile = edgedbToml;
    }

    if (configFile) {
      projectRoot = currentDir;
      const config: {
        project?: { "schema-dir"?: string };
      } = TOML.parse(await readFileUtf8(configFile));

      const maybeProjectTable = config.project;
      const maybeSchemaDir =
        maybeProjectTable && maybeProjectTable["schema-dir"];
      if (typeof maybeSchemaDir === "string") {
        schemaDir = maybeSchemaDir;
      }
      break;
    }
    currentDir = path.join(currentDir, "..");
  }
  return { projectRoot, schemaDir } as const;
}

function normalizeConnection(options: BaseCliOptions): ConnectConfig {
  const config: ConnectConfig = {};
  if (options.instance) config.dsn = options.instance;
  if (options.dsn) config.dsn = options.dsn;
  if (options.credentialsFile) config.credentialsFile = options.credentialsFile;
  if (options.host) config.host = options.host;
  if (typeof options.port === "number") config.port = options.port;
  if (options.database) config.database = options.database;
  if (options.user) config.user = options.user;
  if (options.tlsCaFile) config.tlsCAFile = options.tlsCaFile;
  if (options.tlsSecurity) {
    if (!isValidTlsSecurityValue(options.tlsSecurity)) {
      exitWithError(
        `Invalid value for --tls-security. Must be one of: ${TLS_CHOICES.map((x: TlsSecurity) => `"${x}"`).join(" | ")}`,
      );
    }
    config.tlsSecurity = options.tlsSecurity;
  }
  return config;
}

function normalizeCommandOptions(
  base: BaseCliOptions & {
    target?: Target;
    out?: string;
    outputDir?: string;
    file?: string | true;
  },
): CommandOptions {
  const out = base.out ?? base.outputDir;
  const cmd: CommandOptions = {
    target: base.target,
    out,
    file: typeof base.file === "string" ? base.file : undefined,
    promptPassword: base.password,
    passwordFromStdin: base.passwordFromStdin,
    forceOverwrite: base.forceOverwrite,
    useHttpClient: base.useHttpClient,
    useResolvedCodecType: base.useResolvedCodecType,
  };

  if (base.future) {
    cmd.future = {
      strictTypeNames: true,
      polymorphismAsDiscriminatedUnions: true,
    } as CommandOptions["future"];
  }
  if (base.futureStrictTypeNames) {
    cmd.future = {
      ...cmd.future,
      strictTypeNames: true,
    } as CommandOptions["future"];
  }
  if (base.futurePolymorphismAsDiscriminatedUnions) {
    cmd.future = {
      ...cmd.future,
      polymorphismAsDiscriminatedUnions: true,
    } as CommandOptions["future"];
  }
  if (typeof base.updateIgnoreFile === "boolean") {
    cmd.updateIgnoreFile = base.updateIgnoreFile;
  }
  return cmd;
}

async function ensureTarget(
  options: CommandOptions,
  projectRoot: string | null,
) {
  if (options.target) return;
  // prisma generator does its own thing; callers skip ensureTarget for it
  if (!projectRoot) {
    throw new Error(
      `Failed to detect project root.
Run this command inside an Gel project directory or specify the desired target language with \`--target\``,
    );
  }

  const tsConfigPath = path.join(projectRoot, "tsconfig.json");
  const tsConfigExists = await exists(tsConfigPath);
  const denoConfigPath = path.join(projectRoot, "deno.json");
  const denoJsonExists = await exists(denoConfigPath);

  let packageJson: { type?: string } | null = null;
  const pkgJsonPath = path.join(projectRoot, "package.json");
  if (await exists(pkgJsonPath)) {
    packageJson = JSON.parse(await readFileUtf8(pkgJsonPath));
  }

  // @ts-ignore - Deno global check
  const isDenoRuntime = typeof Deno !== "undefined";

  if (isDenoRuntime || denoJsonExists) {
    options.target = "deno";
    console.log(
      `Detected ${isDenoRuntime ? "Deno runtime" : "deno.json"}, generating TypeScript files with Deno-style imports.`,
    );
  } else if (tsConfigExists) {
    const tsConfig = tsConfigExists
      ? (await readFileUtf8(tsConfigPath)).toLowerCase()
      : "{}";

    const supportsESM: boolean =
      tsConfig.includes(`"module": "nodenext"`) ||
      tsConfig.includes(`"module": "node12"`);
    if (supportsESM && packageJson?.type === "module") {
      options.target = "mts";
      console.log(
        `Detected tsconfig.json with ES module support, generating .mts files with ESM imports.`,
      );
    } else {
      options.target = "ts";
      console.log(`Detected tsconfig.json, generating TypeScript files.`);
    }
  } else {
    if (packageJson?.type === "module") {
      options.target = "esm";
      console.log(
        `Detected "type": "module" in package.json, generating .js files with ES module syntax.`,
      );
    } else {
      console.log(
        `Detected package.json. Generating .js files with CommonJS module syntax.`,
      );
      options.target = "cjs";
    }
  }
  const overrideTargetMessage = `   To override this, use the --target flag.
   Run \`npx @gel/generate --help\` for full options.`;
  console.log(overrideTargetMessage);
}

async function connectClient(
  connectionConfig: ConnectConfig,
  options: CommandOptions,
) {
  if (options.promptPassword) {
    const username = (
      await parseConnectArguments({
        ...connectionConfig,
        password: "",
      })
    ).connectionParams.user;
    connectionConfig.password = await promptForPassword(username);
  }
  if (options.passwordFromStdin) {
    connectionConfig.password = await readPasswordFromStdin();
  }

  try {
    const cxnCreatorFn = options.useHttpClient
      ? createHttpClient
      : createClient;
    return cxnCreatorFn({
      ...connectionConfig,
      concurrency: 5,
    });
  } catch (e) {
    exitWithError(`Failed to connect: ${(e as Error).message}`);
  }
}

async function withClient<T>(
  connection: ConnectConfig,
  options: CommandOptions,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const client = (await connectClient(connection, options)) as Client;
  try {
    return await action(client);
  } catch (e) {
    exitWithError((e as Error).message);
  } finally {
    await client.close();
  }
}

const program = new Command()
  .name("@gel/generate")
  .version("__@gel/generate__VERSION_PLACEHOLDER__")
  .description("Official Gel code generators for TypeScript/JavaScript")
  .configureHelp({
    showGlobalOptions: true,
  })
  // Global connection options
  .option("-I, --instance <instance>")
  .option("--dsn <dsn>")
  .option("--credentials-file <path>")
  .option("-H, --host <host>")
  .addOption(
    new Option("-P, --port <port>").argParser((val: string) =>
      parseInt(val, 10),
    ),
  )
  .option("-d, --database <database>")
  .option("-u, --user <user>")
  .addOption(new Option("--password").conflicts("passwordFromStdin"))
  .addOption(new Option("--password-from-stdin").conflicts("password"))
  .option("--tls-ca-file <path>")
  .addOption(new Option("--tls-security <level>").choices([...TLS_CHOICES]))
  .option("--use-http-client")
  // Shortcut for "all future flags"
  .option("--future", "Enable all future-flagged features");

program
  .command("edgeql-js")
  .description("Generate query builder")
  .addOption(
    new Option("--target <target>").choices([
      "ts",
      "mts",
      "esm",
      "cjs",
      "deno",
    ]),
  )
  .option("--out <path>")
  .option("--output-dir <path>")
  .option("--force-overwrite")
  .option("--no-update-ignore-file")
  .option("--future-strict-type-names", "Enable strict type names")
  .option(
    "--future-polymorphism-as-discriminated-unions",
    "Enable polymorphism as discriminated unions",
  )
  .action(async (opts: EdgeqlJsOptions, _cmd) => {
    const { projectRoot, schemaDir } = await findProjectRootAndSchemaDir();
    const connection = normalizeConnection(opts);
    const options = normalizeCommandOptions(opts);

    await ensureTarget(options, projectRoot);

    await withClient(connection, options, (client) =>
      generateQueryBuilder({ options, client, root: projectRoot, schemaDir }),
    );
  });

program
  .command("queries")
  .description("Generate typed functions from .edgeql files")
  .argument("[patterns...]", "File patterns to match")
  .addOption(
    new Option("--target <target>").choices([
      "ts",
      "mts",
      "esm",
      "cjs",
      "deno",
    ]),
  )
  .option("--file [path]")
  .option("--use-resolved-codec-type")
  .option("--force-overwrite")
  .option("--no-update-ignore-file")
  .action(async (patterns: string[], opts: QueriesOptions, _cmd) => {
    const { projectRoot, schemaDir } = await findProjectRootAndSchemaDir();
    const connection = normalizeConnection(opts);
    const options = normalizeCommandOptions(opts);
    options.patterns = patterns;

    await ensureTarget(options, projectRoot);

    // special handling: --file present but no value => default to <schemaDir>/queries
    const fileWasPresentWithoutValue = (opts as any).file === true;
    if (fileWasPresentWithoutValue) {
      options.file = path.join(schemaDir, "queries");
    }

    await withClient(connection, options, (client) =>
      generateQueryFiles({ options, client, root: projectRoot, schemaDir }),
    );
  });

program
  .command("interfaces")
  .description("Generate TS interfaces for schema types")
  .option("--file <path>")
  .option("--force-overwrite")
  .option("--no-update-ignore-file")
  .action(async (opts: InterfacesOptions, _cmd) => {
    const { projectRoot, schemaDir } = await findProjectRootAndSchemaDir();
    const connection = normalizeConnection(opts);
    const options = normalizeCommandOptions({ ...opts, target: "ts" });

    await withClient(connection, options, (client) =>
      runInterfacesGenerator({ options, client, root: projectRoot, schemaDir }),
    );
  });

// prisma
program
  .command("prisma")
  .description("Generate a Prisma schema for an existing database instance")
  .option("--file <path>")
  .option("--force-overwrite")
  .action(async (opts: PrismaOptions, _cmd) => {
    const connection = normalizeConnection(opts);
    const options = normalizeCommandOptions(opts);

    // prisma does not require target auto-detection
    await withClient(connection, options, (client) =>
      runGelPrismaGenerator({ options, client }),
    );
  });

program.parseAsync(process.argv);
