import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import debug from "debug";

import type { BaseOptions, Recipe } from "../types.js";
import { copyTemplateFiles } from "../../utils.js";

const logger = debug("@gel/create:recipe:gel");

interface GelOptions {
  initializeProject: boolean;
}

const recipe: Recipe<GelOptions> = {
  getOptions() {
    return p.group({
      initializeProject: () =>
        p.confirm({
          message: "Initialize a new Gel project with gel project init?",
          initialValue: true,
        }),
    });
  },

  async apply(
    { projectDir, useGelAuth, packageManager }: BaseOptions,
    { initializeProject }: GelOptions,
  ) {
    logger("Running gel recipe");

    const spinner = p.spinner();

    if (initializeProject) {
      spinner.start("Initializing Gel project");
      try {
        await packageManager.runPackageBin(
          "gel",
          ["project", "init", "--non-interactive"],
          {
            cwd: projectDir,
          },
        );
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
    } else {
      logger("Skipping gel project init");
      logger("Copying basic Gel project files");

      const dirname = path.dirname(new URL(import.meta.url).pathname);
      await copyTemplateFiles(path.resolve(dirname, "./template"), projectDir);
    }

    if (useGelAuth) {
      logger("Adding auth extension to project");

      spinner.start("Enabling auth extension in Gel schema");
      const filePath = path.resolve(projectDir, "./dbschema/default.esdl");
      const data = await fs.readFile(filePath, "utf8");
      await fs.writeFile(filePath, `using extension auth;\n\n${data}`);
      spinner.stop("Auth extension enabled in Gel schema");

      if (initializeProject) {
        logger("Creating and applying initial migration");
        spinner.start("Creating and applying initial migration");
        try {
          await packageManager.runPackageBin("gel", ["migration", "create"], {
            cwd: projectDir,
          });
          await packageManager.runPackageBin("gel", ["migrate"], {
            cwd: projectDir,
          });
          spinner.stop("Initial migration created and applied");
        } catch (error) {
          logger(error);
          spinner.stop("Failed to create and apply migration");
          throw error;
        }
      }
    }
  },
};

export default recipe;
