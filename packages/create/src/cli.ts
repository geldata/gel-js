#!/usr/bin/env node

import * as p from "@clack/prompts";

import { baseRecipe, recipes, finalizeRecipe, runRecipe } from "./recipes/index.js";

async function main() {
  p.intro("Welcome to the Gel Create CLI 🚀");

  const baseOptions = await baseRecipe.getOptions();

  await baseRecipe.apply(baseOptions);

  for (const recipe of recipes) {
    await runRecipe(recipe, baseOptions);
  }

  await finalizeRecipe.apply(baseOptions, undefined);
}

await main();
