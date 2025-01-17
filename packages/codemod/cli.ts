#!/usr/bin/env node

// import * as p from "@clack/prompts";
import pc from "picocolors";
import * as glob from "glob";
import path from "node:path";
import { run } from "jscodeshift/src/Runner.js";
import { findAndUpdateFileExtensions } from "./scripts/esdledgeql-to-gel-file-extensions-update.js";
import { findAndUpdatePackageJson } from "./scripts/package-json-update.js";
import { findAndUpdateToml } from "./scripts/edgeql-to-gel-toml-file-update.js";

const mainTransform = path.resolve(__dirname, "transforms/index.js");

async function main() {
  console.log(pc.magenta("⏳ Running EdgeDB -> Gel codemod... \n"));

  const projectDirectory = process.argv[2] || '.';

  const projectPaths = glob.sync(`${projectDirectory}/**/*.{ts,tsx,js,jsx}`, {
    root: projectDirectory,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  // Log that we're starting the codemod to update imports
  console.log(
    pc.magenta("🔄 Starting the codemod process to update imports...")
  );
  // JSCodeshift runner
  await run(
    mainTransform,
    projectPaths,
    {}
  );

  // Custom scripts
  console.log(
    pc.magenta("\n🔍 Looking for and updating edgedb.toml to gel.toml files...")
  );
  await findAndUpdateToml(path.resolve(projectDirectory));

  console.log(
    pc.magenta("\n🔍 Looking for and updating package.json files...")
  );
  await findAndUpdatePackageJson(path.resolve(projectDirectory));

  console.log(
    pc.magenta("\n🔍 Looking for and updating file extensions...")
  );
  await findAndUpdateFileExtensions(path.resolve(projectDirectory));

  console.log(`\

${pc.magenta('✅ Codemod completed!')}

Need help? Join our Discord: ${pc.green("https://discord.gg/edgedb")}`);
}

main().then(() => process.exit(0), () => process.exit(1));
