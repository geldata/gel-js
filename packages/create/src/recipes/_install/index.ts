import debug from "debug";
import * as p from "@clack/prompts";

import type { BaseOptions, Recipe } from "../types.js";
import { execInLoginShell } from "../../utils.js";

const logger = debug("@gel/create:recipe:install");

interface InstallOptions {
  shouldGitInit: boolean;
  shouldInstall: boolean;
}

const recipe: Recipe<InstallOptions> = {
  getOptions({ packageManager }: BaseOptions) {
    return p.group({
      shouldGitInit: () =>
        p.confirm({
          message: "Initialize a git repository and stage changes?",
          initialValue: true,
        }),
      shouldInstall: () =>
        p.confirm({
          message: `Install dependencies with ${packageManager}?`,
          initialValue: true,
        }),
    });
  },
  async apply(baseOptions: BaseOptions, recipeOptions: InstallOptions) {
    logger("Running install recipe");

    const spinner = p.spinner();

    if (recipeOptions.shouldGitInit) {
      spinner.start("Initializing git repository");
      try {
        await execInLoginShell("git init", {
          cwd: baseOptions.projectDir,
        });
        spinner.stop("Initialized git repository");
      } catch (err) {
        spinner.stop("Failed to initialize git repository");
        throw err;
      }
    }

    if (recipeOptions.shouldInstall) {
      const command = `${baseOptions.packageManager} install`;
      spinner.start(`Installing dependencies: ${command}`);
      try {
        await execInLoginShell(command, {
          cwd: baseOptions.projectDir,
        });
        spinner.stop("Installed dependencies");
      } catch (err) {
        spinner.stop("Failed to install dependencies");
        throw err;
      }
    }

    if (recipeOptions.shouldGitInit) {
      spinner.start("Staging changes");
      try {
        await execInLoginShell("git add .", {
          cwd: baseOptions.projectDir,
        });
        spinner.stop("Staged changes");
      } catch (err) {
        spinner.stop("Failed to stage changes");
        throw err;
      }
    }
  },
};

export default recipe;
