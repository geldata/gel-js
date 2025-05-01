import debug from "debug";
import * as p from "@clack/prompts";
import pc from "picocolors";

import type { BaseOptions, Recipe } from "../types.js";
import { execInLoginShell } from "../../utils.js";

const logger = debug("@gel/create:recipe:finalize");

const recipe: Recipe = {
  async apply(baseOptions: BaseOptions) {
    logger("Running finalize recipe");

    const spinner = p.spinner();

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

    spinner.start("Staging changes and committing initial commit");
    try {
      await execInLoginShell("git add .", {
        cwd: baseOptions.projectDir,
      });
      await execInLoginShell("git commit -m 'Initial commit'", {
        cwd: baseOptions.projectDir,
      });
      spinner.stop("Staged changes and committed initial commit");
    } catch (err) {
      spinner.stop("Failed to stage changes");
      throw err;
    }

  p.outro(`\
Your Gel project has been initialized! 🚀

Enter your project directory using: ${pc.green(
    `cd ${baseOptions.projectName}`,
  )}
Follow the instructions in the ${pc.green("README.md")} file to get started.

Need help? Join our community at ${pc.green("https://geldata.com/community")}`);
  }
}

export default recipe;
