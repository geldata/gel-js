#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";

import { run } from "jscodeshift/src/Runner.js";
import path from "node:path";

const mainTransform = path.resolve(__dirname, "transform.js");

async function main() {
  p.intro("Running EdgeDB -> Gel codemod...");

  const res = await run(
    mainTransform,
    process.argv.slice(2),
    {}
  );

  p.outro(`\
Codemod has been run successfully!

Need help? Join our community at ${pc.green("https://edgedb.com/community")}`);
}

main().then(() => process.exit(0), () => process.exit(1));
