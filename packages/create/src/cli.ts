#!/usr/bin/env node

import * as p from "@clack/prompts";
import pc from "picocolors";

import { baseRecipe, recipes, finalizeRecipe, runRecipe } from "./recipes/index.js";

async function main() {
  p.intro("Welcome to the Gel Create CLI 🚀");

  const baseOptions = await baseRecipe.getOptions();

  await baseRecipe.apply(baseOptions);

  for (const recipe of recipes) {
    await runRecipe(recipe, baseOptions);
  }

  await finalizeRecipe.apply(baseOptions, undefined);

  p.outro(`\
Your Gel project has been initialized! 🚀

Enter your project directory using: ${pc.green(
    `cd ${baseOptions.projectName}`,
  )}
Follow the instructions in the ${pc.green("README.md")} file to get started.

Need help? Join our community at ${pc.green("https://geldata.com/community")}`);
}

await main();
