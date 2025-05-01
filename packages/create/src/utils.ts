import process from "node:process";
import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { quote } from "shell-quote";

type PkgManager = "npm" | "yarn" | "pnpm" | "bun";

export function getPackageManager(): PkgManager {
  const userAgent = process.env.npm_config_user_agent;
  switch (true) {
    case userAgent?.startsWith("yarn"):
      return "yarn";
    case userAgent?.startsWith("pnpm"):
      return "pnpm";
    case userAgent?.startsWith("bun"):
      return "bun";
    default:
      return "npm";
  }
}

const PM_TO_RUNNER_MAP = {
  npm: "npx",
  yarn: "yarn dlx",
  pnpm: "pnpm dlx",
  bun: "bunx",
} as const;

const PM_TO_RUN_SCRIPT_MAP = {
  npm: "npm run",
  yarn: "yarn run",
  pnpm: "pnpm run",
  bun: "bun run",
} as const;

interface CopyTemplateFilesOpts {
  tags?: Set<string>;
  rewritePath?: (path: string) => string;
  injectVars?: { varname: string; value: string; files: string[] }[];
}

export async function copyTemplateFiles(
  source: string,
  dest: string,
  opts?: CopyTemplateFilesOpts,
) {
  await _walkDir(source, dest, source, {
    ...opts,
    injectVars:
      opts?.injectVars?.reduce(
        (vars, { varname, value, files }) => {
          for (const filename of files) {
            const filepath = path.join(source, filename);
            if (!vars[filepath]) {
              vars[filepath] = [];
            }
            vars[filepath].push({ varname, value });
          }
          return vars;
        },
        {} as Record<string, { varname: string; value: string }[]>,
      ) ?? {},
  });
}

async function _walkDir(
  source: string,
  _dest: string,
  untaggedSource: string,
  opts: Omit<CopyTemplateFilesOpts, "injectVars"> & {
    injectVars: Record<string, { varname: string; value: string }[]>;
  },
) {
  const files: Record<string, { entry: Dirent; tags: string[] }[]> = {};
  const dirs: Record<string, { entry: Dirent; tags: string[] }[]> = {};
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const parts = entry.name.split(".");
    const name = [
      parts[0],
      ...parts.slice(1).filter((p) => !p.startsWith("__")),
    ].join(".");
    const tags = parts
      .slice(1)
      .filter((p) => p.startsWith("__"))
      .map((tag) => tag.slice(2));

    if ((entry.isDirectory() ? dirs : files)[name]) {
      (entry.isDirectory() ? dirs : files)[name].push({ entry, tags });
    } else {
      (entry.isDirectory() ? dirs : files)[name] = [{ entry, tags }];
    }
  }

  const dest = opts.rewritePath ? opts.rewritePath(_dest) : _dest;

  for (const [filename, entries] of Object.entries(files)) {
    const file = entries
      .sort((a, b) => b.tags.length - a.tags.length)
      .find((entry) => entry.tags.every((tag) => opts.tags?.has(tag) ?? false));

    if (file) {
      await fs.mkdir(dest, { recursive: true });
      const trueFilepath = path.join(source, file.entry.name);
      const untaggedFilepath = path.join(untaggedSource, filename);
      // n.b. special handling to avoid npm publishing from excluding .gitignore
      const destFilename = filename === "gitignore" ? ".gitignore" : filename;
      const destFilepath = path.join(dest, destFilename);

      if (opts.injectVars[untaggedFilepath]) {
        let content = await fs.readFile(trueFilepath, { encoding: "utf8" });
        for (const { varname, value } of opts.injectVars[untaggedFilepath]) {
          content = content.replace(RegExp(`{{{${varname}}}}`, "g"), value);
        }
        await fs.writeFile(destFilepath, content, {
          encoding: "utf8",
        });
      } else {
        await fs.copyFile(trueFilepath, destFilepath);
      }
    }
  }

  for (const [dirname, entries] of Object.entries(dirs)) {
    const dir = entries
      .sort((a, b) => b.tags.length - a.tags.length)
      .find((entry) => entry.tags.every((tag) => opts.tags?.has(tag) ?? false));

    if (dir) {
      await _walkDir(
        path.join(source, dir.entry.name),
        path.join(dest, dirname),
        path.join(untaggedSource, dirname),
        opts,
      );
    }
  }
}

export async function execInLoginShell(
  command: string,
  options?: SpawnOptionsWithoutStdio,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("/bin/bash", ["-l", "-c", command], options);
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `\
Command "${command}" exited with code ${code}
stderr: ${stderr}
stdout: ${stdout}`,
          ),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export class PackageManager {
  readonly runner: string;
  readonly runScript: string;

  constructor(readonly packageManager = getPackageManager()) {
    this.runner = PM_TO_RUNNER_MAP[packageManager];
    this.runScript = PM_TO_RUN_SCRIPT_MAP[packageManager];
  }

  toString() {
    return this.packageManager;
  }

  async runPackageBin(
    binName: string,
    args: string[] = [],
    options?: SpawnOptionsWithoutStdio,
  ): Promise<{ stdout: string; stderr: string }> {
    const command = quote([this.runner, binName, ...args]);
    return execInLoginShell(command, options);
  }
}
