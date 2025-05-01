import path from "node:path";
import debug from "debug";
import { updatePackage } from "write-package";

import type { BaseOptions, Recipe } from "../types.js";
import { copyTemplateFiles } from "../../utils.js";

const logger = debug("@gel/create:recipe:nextjs");

const recipe: Recipe = {
  skip(opts: BaseOptions) {
    return opts.framework !== "next";
  },
  async apply({ projectDir, packageManager }: BaseOptions) {
    logger("Running nextjs recipe");

    const dirname = path.dirname(new URL(import.meta.url).pathname);

    await copyTemplateFiles(path.resolve(dirname, "./template"), projectDir);

    await updatePackage(projectDir, {
      scripts: {
        "dev:next": "next dev",
        "dev:gel": "gel watch --migrate",
        dev: "run-p --print-label dev:*",
        "db:generate": "run-s --print-label db:generate:*",
        "db:generate:qb": `${packageManager.runner} generate edgeql-js`,
        "db:generate:queries": `${packageManager.runner} generate queries`,
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: {
        gel: "^2",
        react: "^19.1.0",
        "react-dom": "^19.1.0",
        next: "^15",
      },
      devDependencies: {
        typescript: "^5",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "npm-run-all": "^4",
        postcss: "^8",
        tailwindcss: "^4",
        "@tailwindcss/postcss": "^4",
      },
    });
  },
};

export default recipe;
