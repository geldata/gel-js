import path from "node:path";
import debug from "debug";
import { updatePackage } from "write-package";

import type { BaseOptions, Recipe } from "../types.js";
import { copyTemplateFiles } from "../../utils.js";

const logger = debug("@gel/create:recipe:remix");

const recipe: Recipe = {
  skip(opts: BaseOptions) {
    return opts.framework !== "remix";
  },
  async apply({ projectDir }: BaseOptions) {
    logger("Running remix recipe");

    const dirname = path.dirname(new URL(import.meta.url).pathname);

    await copyTemplateFiles(path.resolve(dirname, "./template"), projectDir);

    await updatePackage(projectDir, {
      sideEffects: false,
      type: "module",
      scripts: {
        dev: "remix dev --manual",
        build: "remix build",
        lint: "eslint --ignore-path .gitignore --cache --cache-location ./node_modules/.cache/eslint .",
        start: "remix-serve ./build/index.js",
        typecheck: "tsc",
      },
      dependencies: {
        react: "^18",
        "react-dom": "^18",
        "@remix-run/css-bundle": "*",
        "@remix-run/node": "*",
        "@remix-run/react": "*",
        "@remix-run/serve": "*",
        isbot: "^3.6.8",
      },
      devDependencies: {
        "@remix-run/dev": "*",
        "@types/react": "^18.2.20",
        "@types/react-dom": "^18.2.7",
        "@typescript-eslint/eslint-plugin": "^6.7.4",
        "@typescript-eslint/parser": "^6.7.4",
        eslint: "^8.38.0",
        "eslint-import-resolver-typescript": "^3.6.1",
        "eslint-plugin-import": "^2.28.1",
        "eslint-plugin-jsx-a11y": "^6.7.1",
        "eslint-plugin-react": "^7.33.2",
        "eslint-plugin-react-hooks": "^4.6.0",
        typescript: "^5.1.6",
      },
      engines: {
        node: ">=18.0.0",
      },
    });
  },
};

export default recipe;
