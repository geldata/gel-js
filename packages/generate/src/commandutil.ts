#!/usr/bin/env node

import process from "node:process";
import { systemUtils } from "gel";
import { type Target, exitWithError } from "./genutil";
import type { defaultFutureFlags } from "./edgeql-js";

export interface CommandOptions {
  showHelp?: boolean;
  target?: Target;
  out?: string;
  file?: string;
  watch?: boolean;
  promptPassword?: boolean;
  passwordFromStdin?: boolean;
  forceOverwrite?: boolean;
  updateIgnoreFile?: boolean;
  useHttpClient?: boolean;
  future?: Partial<Record<keyof typeof defaultFutureFlags, boolean>>;
}

const { input } = systemUtils;

export function isTTY() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

export async function promptBoolean(prompt: string, defaultVal?: boolean) {
  const response = await promptEnum(
    prompt,
    ["y", "n"],
    defaultVal !== undefined ? (defaultVal ? "y" : "n") : undefined,
  );
  return response === "y";
}

async function promptEnum<Val extends string, Default extends Val>(
  question: string,
  vals: Val[],
  defaultVal?: Default,
): Promise<Val> {
  let response = await input(
    `${question}[${vals.join("/")}]${
      defaultVal !== undefined ? ` (leave blank for "${defaultVal}")` : ""
    }\n> `,
  );
  response = response.trim().toLowerCase();

  if (vals.includes(response as any)) {
    return response as Val;
  } else if (!response && defaultVal !== undefined) {
    return defaultVal as Val;
  } else {
    exitWithError(`Unknown value: '${response}'`);
  }
}

export async function promptForPassword(username: string) {
  if (!isTTY()) {
    exitWithError(
      `Cannot use --password option in non-interactive mode. ` +
        `To read password from stdin use the --password-from-stdin option.`,
    );
  }

  return await input(`Password for '${username}': `, { silent: true });
}

export function readPasswordFromStdin() {
  if (process.stdin.isTTY) {
    exitWithError(`Cannot read password from stdin: stdin is a TTY.`);
  }

  return new Promise<string>((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trimEnd()));
  });
}
