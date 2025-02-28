#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { systemUtils, type Client, createClient, createHttpClient } from "gel";
import * as TOML from "@iarna/toml";

import {
  type ConnectConfig,
  validTlsSecurityValues,
  isValidTlsSecurityValue,
} from "gel/dist/conUtils";
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

enum Generator {
  QueryBuilder = "edgeql-js",
  Queries = "queries",
  Interfaces = "interfaces",
  GelPrisma = "prisma",
}

const availableGeneratorsHelp = `
Available generators:
 - edgeql-js (query builder)
 - queries (query files)
 - interfaces`;

const run = async () => {
  const args = process.argv.slice(2);
  const generator: Generator = args.shift() as any;

  const connectionConfig: ConnectConfig = {};
  const options: CommandOptions = {};

  if ((generator as any) === "-h" || (generator as any) === "--help") {
    printHelp();
    process.exit();
  }
  if (!generator || generator[0] === "-") {
    console.error(
      `Error: No generator specified.\n  \`npx @gel/generate <generator>\`${availableGeneratorsHelp}`,
    );
    process.exit();
  }
  if (!Object.values(Generator).includes(generator)) {
    console.error(
      `Error: Invalid generator "${generator}".${availableGeneratorsHelp}`,
    );
    process.exit();
  }

  switch (generator) {
    case Generator.QueryBuilder:
      break;
    case Generator.Queries:
      break;
    case Generator.Interfaces:
      options.target = "ts";
      break;
    case Generator.GelPrisma:
      break;
  }

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

  while (args.length) {
    let flag = args.shift()!;
    let val: string | null = null;
    if (flag.startsWith("--")) {
      if (flag.includes("=")) {
        const [f, ...v] = flag.split("=");
        flag = f!;
        val = v.join("=");
      }
    } else if (flag.startsWith("-")) {
      val = flag.slice(2) || null;
      flag = flag.slice(0, 2);
    }

    const getVal = () => {
      if (val !== null) {
        const v = val;
        val = null;
        return v;
      }
      if (args.length === 0) {
        console.error(`Error: No value provided for ${flag} option`);
        process.exit();
      }
      return args.shift();
    };

    switch (flag) {
      case "-h":
      case "--help":
        options.showHelp = true;
        break;
      case "-I":
      case "--instance":
      case "--dsn":
        connectionConfig.dsn = getVal();
        break;
      case "--credentials-file":
        connectionConfig.credentialsFile = getVal();
        break;
      case "-H":
      case "--host":
        connectionConfig.host = getVal();
        break;
      case "-P":
      case "--port":
        connectionConfig.port = Number(getVal());
        break;
      case "-d":
      case "--database":
        connectionConfig.database = getVal();
        break;
      case "-u":
      case "--user":
        connectionConfig.user = getVal();
        break;
      case "--password":
        if (options.passwordFromStdin === true) {
          exitWithError(
            `Cannot use both --password and --password-from-stdin options`,
          );
        }
        options.promptPassword = true;
        break;
      case "--password-from-stdin":
        if (options.promptPassword === true) {
          exitWithError(
            `Cannot use both --password and --password-from-stdin options`,
          );
        }
        options.passwordFromStdin = true;
        break;
      case "--tls-ca-file":
        connectionConfig.tlsCAFile = getVal();
        break;
      case "--tls-security": {
        const tlsSec = getVal();
        if (!isValidTlsSecurityValue(tlsSec)) {
          exitWithError(
            `Invalid value for --tls-security. Must be one of: ${validTlsSecurityValues
              .map((x) => `"${x}"`)
              .join(" | ")}`,
          );
        }
        connectionConfig.tlsSecurity = tlsSec;
        break;
      }
      case "--use-http-client":
        options.useHttpClient = true;
        break;
      case "--target": {
        if (
          generator === Generator.Interfaces ||
          generator === Generator.GelPrisma
        ) {
          exitWithError(
            `--target is not supported for generator "${generator}"`,
          );
        }
        const target = getVal();
        if (!target || !["ts", "esm", "cjs", "mts", "deno"].includes(target)) {
          exitWithError(
            `Invalid target "${
              target ?? ""
            }", expected "deno", "mts", "ts", "esm" or "cjs"`,
          );
        }
        options.target = target as Target;
        break;
      }
      case "--out":
      case "--output-dir":
        if (
          generator === Generator.Interfaces ||
          generator === Generator.Queries
        ) {
          exitWithError(
            `--output-dir is not supported for generator "${generator}"` +
              `, consider using the --file option instead`,
          );
        }
        options.out = getVal();
        break;
      case "--file":
        if (
          generator === Generator.Interfaces ||
          generator === Generator.GelPrisma
        ) {
          options.file = getVal();
        } else if (generator === Generator.Queries) {
          if (args.length > 0 && args[0]![0] !== "-") {
            options.file = getVal();
          } else {
            options.file = path.join(schemaDir, "queries");
          }
        } else {
          exitWithError(
            `Flag --file not supported for generator "${generator}"` +
              `, consider using the --output-dir option instead`,
          );
        }

        break;
      case "--watch":
        options.watch = true;
        exitWithError(
          `Watch mode is not supported for generator "${generator}"`,
        );
        break;
      case "--force-overwrite":
        options.forceOverwrite = true;
        break;
      case "--no-update-ignore-file":
        options.updateIgnoreFile = false;
        break;
      case "--future":
        options.future = {
          strictTypeNames: true,
          polymorphismAsDiscriminatedUnions: true,
        };
        break;
      case "--future-strict-type-names":
        options.future = {
          ...options.future,
          strictTypeNames: true,
        };
        break;
      case "--future-polymorphism-as-discriminated-unions":
        options.future = {
          ...options.future,
          polymorphismAsDiscriminatedUnions: true,
        };
        break;
      default:
        exitWithError(`Unknown option: ${flag}`);
    }

    if (val !== null) {
      exitWithError(`Option ${flag} does not take a value`);
    }
  }

  if (options.showHelp) {
    printHelp();
    process.exit();
  }

  switch (generator) {
    case Generator.QueryBuilder:
      console.log(`Generating query builder...`);
      break;
    case Generator.Queries:
      console.log(`Generating functions from .edgeql files...`);
      break;
    case Generator.Interfaces:
      console.log(`Generating TS interfaces from schema...`);
      break;
    case Generator.GelPrisma:
      console.log(`Generating Prisma schema from database...`);
      break;
  }

  // don't need to do any of that for the prisma schema generator
  if (!options.target && generator !== Generator.GelPrisma) {
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

    let packageJson: { type: string } | null = null;
    const pkgJsonPath = path.join(projectRoot, "package.json");
    if (await exists(pkgJsonPath)) {
      packageJson = JSON.parse(await readFileUtf8(pkgJsonPath));
    }

    // doesn't work with `extends`
    // switch to more robust solution after splitting
    // @gel/generate into separate package
    // @ts-ignore
    const isDenoRuntime = typeof Deno !== "undefined";

    if (isDenoRuntime || denoJsonExists) {
      options.target = "deno";
      console.log(
        `Detected ${
          isDenoRuntime ? "Deno runtime" : "deno.json"
        }, generating TypeScript files with Deno-style imports.`,
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

  let client: Client;
  try {
    const cxnCreatorFn = options.useHttpClient
      ? createHttpClient
      : createClient;
    client = cxnCreatorFn({
      ...connectionConfig,
      concurrency: 5,
    });
  } catch (e) {
    exitWithError(`Failed to connect: ${(e as Error).message}`);
  }

  try {
    switch (generator) {
      case Generator.QueryBuilder:
        await generateQueryBuilder({
          options,
          client,
          root: projectRoot,
          schemaDir,
        });
        break;
      case Generator.Queries:
        await generateQueryFiles({
          options,
          client,
          root: projectRoot,
          schemaDir,
        });
        break;
      case Generator.Interfaces:
        await runInterfacesGenerator({
          options,
          client,
          root: projectRoot,
          schemaDir,
        });
        break;
      case Generator.GelPrisma:
        await runGelPrismaGenerator({
          options,
          client,
        });
        break;
    }
  } catch (e) {
    exitWithError((e as Error).message);
  } finally {
    await client.close();
  }
  process.exit();
};

function printHelp() {
  console.log(`@gel/generate

Official Gel code generators for TypeScript/JavaScript

USAGE
    npx @gel/generate [COMMAND] [OPTIONS]

COMMANDS:
    queries         Generate typed functions from .edgeql files
    edgeql-js       Generate query builder
    interfaces      Generate TS interfaces for schema types
    prisma          Generate a Prisma schema for an existing database instance


CONNECTION OPTIONS:
    -I, --instance <instance>
    --dsn <dsn>
    --credentials-file <path/to/credentials.json>
    -H, --host <host>
    -P, --port <port>
    -d, --database <database>
    -u, --user <user>
    --password
    --password-from-stdin
    --tls-ca-file <path/to/certificate>
    --tls-security <insecure | no_host_verification | strict | default>

OPTIONS:
    --target [ts,mts,esm,cjs,deno]

        ts     Generate TypeScript files (.ts)
        mts    Generate TypeScript files (.mts) with ESM imports
        esm    Generate JavaScript with ESM syntax
        cjs    Generate JavaScript with CommonJS syntax
        deno   Generate TypeScript files (.ts) with Deno-style (*.ts) imports

    --out, --output-dir <path>
        Change the output directory the querybuilder files are generated into
        (Only valid for 'edgeql-js' generator)
    --file <path>
        Change the output filepath of the 'queries', 'interfaces', and 'prisma' generators
        When used with the 'queries' generator, also changes output to single-file mode
    --force-overwrite
        Overwrite <path> contents without confirmation
    --no-update-ignore-file
        Do not prompt to update gitignore with generated code
    --future
        Include future features
    --future-strict-type-names
        Return the exact string literal for .__type__.name instead of a general string type
    --future-polymorphism-as-discriminated-unions
        Use a discriminated union as the return type for polymorphic queries, where each member includes __typename
`);
}
run();
