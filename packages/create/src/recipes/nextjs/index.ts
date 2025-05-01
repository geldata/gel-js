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
  async apply({ projectDir }: BaseOptions) {
    logger("Running nextjs recipe");

    const dirname = path.dirname(new URL(import.meta.url).pathname);

    const tags = new Set<string>(["app", "tw"]);

    await copyTemplateFiles(
      path.resolve(dirname, "./template/ts"),
      projectDir,
      {
        tags,
        injectVars: [
          {
            varname: "srcDir",
            value: "",
            files: [
              "tsconfig.json",
              "jsconfig.json",
              "tailwind.config.ts",
              "src/app/page.tsx",
              "src/pages/index.tsx",
            ],
          },
        ],
      },
    );

    await updatePackage(projectDir, {
      scripts: {
        "dev:next": "next dev",
        "dev:gel": "gel watch --migrate",
        dev: "run-p --print-label dev:*",
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
