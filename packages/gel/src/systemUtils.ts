import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { Writable } from "node:stream";

export async function readFileUtf8(...pathParts: string[]): Promise<string> {
  return await fs.readFile(path.join(...pathParts), { encoding: "utf8" });
}

export function hasFSReadPermission(): boolean {
  // @ts-ignore
  if (typeof Deno !== "undefined") {
    // @ts-ignore
    return Deno.permissions.querySync({ name: "read" }).state === "granted";
  }
  return true;
}

export function hashSHA1toHex(msg: string): string {
  return crypto.createHash("sha1").update(msg).digest("hex");
}

export async function walk(
  dir: string,
  params?: { match?: RegExp[]; skip?: RegExp[] },
): Promise<string[]> {
  const { match, skip = [] } = params || {};

  try {
    await fs.access(dir);
  } catch (_err) {
    return [];
  }
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const fspath = path.resolve(dir, dirent.name);
      if (skip) {
        // at least one skip pattern matches
        if (skip.some((re) => re.test(fspath))) {
          return [];
        }
      }
      if (dirent.isDirectory()) {
        return walk(fspath, params);
      }
      if (match) {
        // at least one match pattern matches
        if (!match.some((re) => re.test(fspath))) {
          return [];
        }
      }

      return [fspath];
    }),
  );

  return Array.prototype.concat(...files);
}

export async function exists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

export async function input(
  message: string,
  params?: { silent?: boolean },
): Promise<string> {
  let silent = false;
  const output = params?.silent
    ? new Writable({
        write(
          chunk: any,
          encoding: NodeJS.BufferEncoding,
          callback: (...args: any) => void,
        ) {
          if (!silent) process.stdout.write(chunk, encoding);
          callback();
        },
      })
    : process.stdout;
  const rl = readline.createInterface({
    input: process.stdin,
    output,
  });

  return new Promise((resolve) => {
    rl.question(message, (val) => {
      rl.close();
      resolve(val);
    });
    silent = true;
  });
}
