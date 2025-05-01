import baseRecipe from "./_base/index.js";
import _gelInit from "./_gel/index.js";
import finalizeRecipe from "./_finalize/index.js";

import express from "./express/index.js";
import nextjs from "./nextjs/index.js";
import remix from "./remix/index.js";
import sveltekit from "./sveltekit/index.js";

import type { BaseOptions, Recipe } from "./types.js";

export { baseRecipe, finalizeRecipe };

export const recipes: Recipe<any>[] = [
  // frameworks
  express,
  nextjs,
  remix,
  sveltekit,
  // init
  _gelInit,
];

export async function runRecipe(recipe: Recipe<any>, baseOptions: BaseOptions) {
  if (recipe.skip?.(baseOptions)) {
    return;
  }

  const recipeOptions = await recipe.getOptions?.(baseOptions);
  await recipe.apply(baseOptions, recipeOptions);
}
