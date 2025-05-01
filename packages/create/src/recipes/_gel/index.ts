import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import TOML from "smol-toml";
import path from "node:path";
import debug from "debug";

import type { BaseOptions, Recipe } from "../types.js";

const logger = debug("@gel/create:recipe:gel");

const recipe: Recipe = {
  async apply({ projectDir, packageManager }: BaseOptions) {
    logger("Running gel recipe");

    const spinner = p.spinner();

    spinner.start("Initializing Gel project");
    try {
      await packageManager.runPackageBin(
        "gel",
        ["project", "init", "--non-interactive"],
        {
          cwd: projectDir,
        },
      );

      const configPath = path.resolve(projectDir, "gel.toml");
      const config = TOML.parse(await fs.readFile(configPath, "utf8"));
      config.hooks = {
        schema: {
          update: {
            after: `${packageManager.runScript} db:generate`,
          },
        },
      };
      await fs.writeFile(configPath, TOML.stringify(config));

      const { stdout, stderr } = await packageManager.runPackageBin(
        "gel",
        ["query", "select sys::get_version_as_str()"],
        { cwd: projectDir },
      );
      const serverVersion = JSON.parse(stdout.trim());
      logger(`Gel server version: ${serverVersion}`);

      if (serverVersion === "") {
        const err = new Error(
          "There was a problem initializing the Gel project",
        );
        spinner.stop(err.message);
        logger({ stdout, stderr });
        throw err;
      }

      spinner.stop(`Gel v${serverVersion} project initialized`);
    } catch (error) {
      logger(error);
      spinner.stop("Failed to initialize Gel project");
      throw error;
    }
  },
};

export default recipe;
