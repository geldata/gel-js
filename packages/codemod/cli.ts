#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";
import * as glob from "glob";
import path from "node:path";
import { run } from "jscodeshift/src/Runner.js";
import { findAndUpdateToml } from "./scripts/edgeql-to-gel-file-extensions-update.js";
import { findAndUpdatePackageJson } from "./scripts/package-json-update.js";

const mainTransform = path.resolve(__dirname, "transforms/index.js");

async function main() {
  p.intro("Running EdgeDB -> Gel codemod...");

  const projectDirectory = process.argv[2] || '.';

  const projectPaths = glob.sync(`${projectDirectory}/**/*.{ts,tsx,js,jsx}`, {
    root: projectDirectory,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  // JSCodeshift runner
  await run(
    mainTransform,
    projectPaths,
    {}
  );

  // Custom scripts
  await findAndUpdateToml(path.resolve(projectDirectory));
  await findAndUpdatePackageJson(path.resolve(projectDirectory));

  p.outro(`\
Codemod completed!

Need help? Join our Discord: ${pc.green("https://discord.gg/edgedb")}`);
}

main().then(() => process.exit(0), () => process.exit(1));
