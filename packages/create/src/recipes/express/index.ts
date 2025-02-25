import path from "node:path";
import debug from "debug";
import { updatePackage } from "write-package";

import type { BaseOptions, Recipe } from "../types.js";
import { copyTemplateFiles } from "../../utils.js";

const logger = debug("@gel/create:recipe:express");

const recipe: Recipe = {
  skip(opts: BaseOptions) {
    return opts.framework !== "express";
  },
  async apply(baseOptions: BaseOptions) {
    logger("Running express recipe");

    const dirname = path.dirname(new URL(import.meta.url).pathname);
    await copyTemplateFiles(
      path.resolve(dirname, "./template"),
      baseOptions.projectDir,
    );

    await updatePackage(baseOptions.projectDir, {
      sideEffects: false,
      type: "module",
      scripts: {
        dev: "DEBUG=* GEL_CLIENT_SECURITY=insecure_dev_mode tsx watch --clear-screen=false src/index.ts",
        build: "tsc",
        lint: "eslint --ignore-path .gitignore --cache --cache-location ./node_modules/.cache/eslint .",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        ...(baseOptions.useGelAuth ? { "@gel/auth-express": "^0.3.0" } : {}),
        "cookie-parser": "^1.4.6",
        express: "^4.18.2",
      },
      devDependencies: {
        "@types/cookie-parser": "^1.4.6",
        "@types/express": "^4.17.21",
        "@types/node": "^20.10.3",
        tsx: "^4.6.2",
        typescript: "^5.3.2",
      },
    });
  },
};

export default recipe;
