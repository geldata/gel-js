import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

import debug from "debug";
import * as p from "@clack/prompts";
import { updatePackage } from "write-package";

import { copyTemplateFiles, PackageManager } from "../../utils.js";
import type { Framework, BaseRecipe, BaseOptions } from "../types.js";

const logger = debug("@gel/create:recipe:base");

const recipe: BaseRecipe = {
  async getOptions() {
    const packageManager = new PackageManager();
    logger({ packageManager });

    const opts = await p.group(
      {
        projectName: () =>
          p.text({
            message: "What is the name of your project or application?",
          }),
        framework: () =>
          p.select<{ value: Framework; label: string }[], Framework>({
            message: "What web framework should be used?",
            options: [
              { value: "next", label: "Next.js" },
              { value: "remix", label: "Remix" },
              { value: "express", label: "Express" },
              { value: "sveltekit", label: "SvelteKit" },
              { value: "node-http", label: "Node HTTP Server" },
              { value: "none", label: "None" },
            ],
          }),
      },
      {
        onCancel: () => {
          process.exit(1);
        },
      },
    );

    return {
      ...opts,
      packageManager,
      projectDir: path.resolve(process.cwd(), opts.projectName),
    };
  },
  async apply({ projectDir, projectName }: BaseOptions) {
    logger("Running base recipe");
    try {
      const projectDirStat = await fs.stat(projectDir);
      logger({ projectDirStat });

      if (!projectDirStat.isDirectory()) {
        throw new Error(
          `Target project directory ${projectDir} is not a directory`,
        );
      }
      const files = await fs.readdir(projectDir);
      if (files.length > 0) {
        throw new Error(`Target project directory ${projectDir} is not empty`);
      }
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        await fs.mkdir(projectDir, { recursive: true });
        logger(`Created project directory: ${projectDir}`);
      } else {
        throw err;
      }
    }

    const dirname = path.dirname(new URL(import.meta.url).pathname);

    logger("Copying files");
    await copyTemplateFiles(path.resolve(dirname, "./template"), projectDir);

    logger("Writing package.json");
    await updatePackage(projectDir, { name: projectName });
  },
};

export default recipe;
