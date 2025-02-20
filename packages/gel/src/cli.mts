#!/usr/bin/env node
import { execSync, type ExecSyncOptions } from "node:child_process";
import { createWriteStream } from "node:fs";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as process from "node:process";
import * as semver from "semver";
import envPaths from "env-paths";
import Debug from "debug";
import which from "which";
import { quote } from "shell-quote";

const debug = Debug("gel:cli");

const IS_TTY = process.stdout.isTTY;
const SCRIPT_LOCATION = await fs.realpath(fileURLToPath(import.meta.url));
const EDGEDB_PKG_ROOT = "https://packages.edgedb.com";
const CACHE_DIR = envPaths("gel", { suffix: "" }).cache;
const CACHED_CLI_PATH = path.join(CACHE_DIR, "/bin/gel");

interface Package {
  name: string;
  version: string;
  revision: string;
  installref: string;
}

const SCRIPT_NAME = import.meta.url.split("/").pop() || "gel";

debug("Process argv:", process.argv);
// n.b. Using `npx`, the 3rd argument is the script name, unlike
// `node` where the 2nd argument is the script name.
let args = process.argv.slice(2);
if (args[0] === SCRIPT_NAME) {
  args = args.slice(1);
}
await main(args);

async function main(args: string[]) {
  debug(`Running CLI wrapper from: ${fileURLToPath(import.meta.url)}`);
  debug("Starting main function with args:", args);
  debug(`  - IS_TTY: ${IS_TTY}`);
  debug(`  - SCRIPT_LOCATION: ${SCRIPT_LOCATION}`);
  debug(`  - EDGEDB_PKG_ROOT: ${EDGEDB_PKG_ROOT}`);
  debug(`  - CACHE_DIR: ${CACHE_DIR}`);
  debug(`  - CACHED_CLI_PATH: ${CACHED_CLI_PATH}`);

  // check to see if we are being tested as a CLI binary wrapper
  if (args.length === 1 && args[0] === "--succeed-if-cli-bin-wrapper") {
    process.exit(0);
  }

  const cliLocation: string | null =
    (await whichGelCli()) ??
    (await getCliLocationFromCachedCli()) ??
    (await getCachedCliLocation()) ??
    null;

  if (cliLocation === null) {
    throw Error("Failed to find or install Gel CLI.");
  }

  try {
    runCli(args, cliLocation);
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof err.status === "number"
    ) {
      process.exit(err.status);
    } else {
      console.error(err);
    }

    process.exit(1);
  }

  process.exit(0);
}

async function whichGelCli() {
  debug("Checking if CLI is in PATH...");
  const locations =
    (await which(SCRIPT_NAME, { nothrow: true, all: true })) || [];

  for (const location of locations) {
    const actualLocation = await fs.realpath(location);
    debug(
      `  - CLI found in PATH at: ${location} (resolved to: ${actualLocation})`,
    );

    if (actualLocation === SCRIPT_LOCATION) {
      debug("  - CLI found in PATH is the current script. Ignoring.");
      continue;
    }

    const lowerCaseLocation = actualLocation.toLowerCase();
    // n.b. Windows package binaries are actual scripts
    if (
      lowerCaseLocation.endsWith(".cmd") ||
      lowerCaseLocation.endsWith(".ps1")
    ) {
      debug("  - CLI found in PATH is a Windows script. Ignoring.");
      continue;
    }

    // n.b. pnpm uses a shell script for package binaries instead of symlinks
    if (lowerCaseLocation.includes("node_modules/.bin")) {
      debug(
        "  - CLI found in PATH is in a node_modules/.bin directory. Ignoring.",
      );
      continue;
    }

    try {
      runCli(["--succeed-if-cli-bin-wrapper"], actualLocation, {
        stdio: "ignore",
      });
      debug("  - CLI found in PATH is wrapper script. Ignoring.");
      continue;
    } catch (_err) {
      debug("  - CLI found in PATH is not a wrapper script. Using.");
    }

    return location;
  }
  debug("  - No CLI found in PATH.");
  return null;
}

async function getCachedCliLocation(): Promise<string> {
  try {
    const stats = await fs.stat(CACHED_CLI_PATH);
    if (!stats.isFile()) {
      debug(
        "  - Object found at cached CLI path is not a file. Downloading...",
      );
      await downloadCliPackage();
    }
  } catch (_err) {
    debug("  - No cached CLI found. Downloading...");
    await downloadCliPackage();
  }

  await fs.access(CACHED_CLI_PATH, fs.constants.F_OK);
  return CACHED_CLI_PATH;
}

async function getCliLocationFromCachedCli(): Promise<string | null> {
  debug("Installing temporary CLI to get install directory...");
  const cachedCliLocation = await getCachedCliLocation();

  const installDir = getInstallDir(cachedCliLocation);
  const binaryPath = path.join(installDir, "gel");
  debug("  - CLI installed at:", binaryPath);

  try {
    debug("  - CLI binary found in path:", binaryPath);
    await fs.access(binaryPath, fs.constants.F_OK);
    return binaryPath;
  } catch {
    debug("  - CLI binary not found in path:", binaryPath);
    return null;
  }
}

async function downloadCliPackage() {
  debug("Downloading CLI package...");
  const cliPkg = await findPackage();
  const downloadDir = path.dirname(CACHED_CLI_PATH);
  await fs.mkdir(downloadDir, { recursive: true }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const downloadUrl = new URL(cliPkg.installref, EDGEDB_PKG_ROOT);
  await downloadFile(downloadUrl, CACHED_CLI_PATH);
  debug("  - CLI package downloaded to:", CACHED_CLI_PATH);

  const fd = await fs.open(CACHED_CLI_PATH, "r+");
  await fd.chmod(0o755);
  await fd.datasync();
  await fd.close();
}

function runCli(
  args: string[],
  pathToCli: string,
  execOptions: ExecSyncOptions = { stdio: "inherit" },
) {
  const command = quote([pathToCli, ...args]);
  debug(`Running Gel CLI: ${command}`);
  return execSync(command, execOptions);
}

async function findPackage(): Promise<Package> {
  const arch = os.arch();
  const platform = os.platform();
  const includeCliPrereleases = true;
  const cliVersionRange = ">=4.1.1";
  const libc = platform === "linux" ? "musl" : "";
  const dist = getBaseDist(arch, platform, libc);

  debug(`Finding compatible package for ${dist}...`);
  const versionMap = await getVersionMap(dist);
  const pkg = await getMatchingPkg(
    versionMap,
    cliVersionRange,
    includeCliPrereleases,
  );
  if (!pkg) {
    throw Error(
      `No compatible Gel CLI package found for the current platform ${dist}`,
    );
  }
  debug("  - Package found:", pkg);
  return pkg;
}

async function getVersionMap(dist: string): Promise<Map<string, Package>> {
  debug("Getting version map for distribution:", dist);
  const indexRequest = await fetch(
    new URL(`archive/.jsonindexes/${dist}.json`, EDGEDB_PKG_ROOT),
  );
  const index = (await indexRequest.json()) as { packages: Package[] };
  const versionMap = new Map();

  for (const pkg of index.packages) {
    if (pkg.name !== "edgedb-cli") {
      continue;
    }

    if (
      !versionMap.has(pkg.version) ||
      versionMap.get(pkg.version).revision < pkg.revision
    ) {
      versionMap.set(pkg.version, pkg);
    }
  }

  return versionMap;
}

async function getMatchingPkg(
  versionMap: Map<string, Package>,
  cliVersionRange: string,
  includeCliPrereleases: boolean,
): Promise<Package | null> {
  debug("Getting matching version for range:", cliVersionRange);
  let matchingPkg: Package | null = null;
  for (const [version, pkg] of versionMap.entries()) {
    if (
      semver.satisfies(version, cliVersionRange, {
        includePrerelease: includeCliPrereleases,
      })
    ) {
      if (
        !matchingPkg ||
        semver.compareBuild(version, matchingPkg.version) > 0
      ) {
        matchingPkg = pkg;
      }
    }
  }

  if (matchingPkg) {
    debug("  - Matching version found:", matchingPkg.version);
    return matchingPkg;
  } else {
    throw Error(
      "no published Gel CLI version matches requested version " +
        `'${cliVersionRange}'`,
    );
  }
}

async function downloadFile(url: string | URL, path: string) {
  debug("Downloading file from URL:", url);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`  - Download failed: ${response.statusText}`);
  }

  const fileStream = createWriteStream(path, { flush: true });

  if (response.body) {
    for await (const chunk of streamReader(response.body)) {
      fileStream.write(chunk);
    }
    fileStream.end();
    debug("  - File downloaded successfully.");
  } else {
    throw new Error("  - Download failed: no response body");
  }
}

function getBaseDist(arch: string, platform: string, libc = ""): string {
  debug("Getting base distribution for:", arch, platform, libc);
  let distArch = "";
  let distPlatform = "";

  if (platform === "linux") {
    if (libc === "") {
      libc = "gnu";
    }
    distPlatform = `unknown-linux-${libc}`;
  } else if (platform === "darwin") {
    distPlatform = "apple-darwin";
  } else {
    throw Error(`This action cannot be run on ${platform}`);
  }

  if (arch === "x64") {
    distArch = "x86_64";
  } else if (arch === "arm64") {
    distArch = "aarch64";
  } else {
    throw Error(`This action does not support the ${arch} architecture`);
  }

  const dist = `${distArch}-${distPlatform}`;
  debug("  - Base distribution:", dist);
  return dist;
}

function getInstallDir(cliPath: string): string {
  debug("Getting install directory for CLI path:", cliPath);
  const installDir = runCli(["info", "--get", "install-dir"], cliPath, {
    stdio: "pipe",
  })
    .toString()
    .trim();
  debug("  - Install directory:", installDir);
  return installDir;
}

async function* streamReader(readableStream: ReadableStream<Uint8Array>) {
  debug("Reading stream...");
  const reader = readableStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
  debug("  - Stream reading completed.");
}
