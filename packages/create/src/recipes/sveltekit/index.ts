import path from "node:path";
import * as p from "@clack/prompts";
import debug from "debug";
import { updatePackage } from "write-package";
import { copyTemplateFiles } from "../../utils.js";
import type { BaseOptions, Recipe } from "../types.js";

const logger = debug("@gel/create:recipe:sveltekit");

interface SveltekitOptions {
  lang: "ts" | "jsdoc" | "js";
}

const template = {
  ts: "./template/ts",
  jsdoc: "./template/jsdoc",
  js: "./template/js",
};

const recipe: Recipe<SveltekitOptions> = {
  skip(opts: BaseOptions) {
    return opts.framework !== "sveltekit";
  },
  getOptions() {
    return p.group({
      lang: () =>
        p.select<
          { value: SveltekitOptions["lang"]; label: string }[],
          SveltekitOptions["lang"]
        >({
          message: "Add type checking with TypeScript??",
          options: [
            { value: "ts", label: "Yes, using Typescript syntax" },
            {
              value: "jsdoc",
              label: "Yes, using Javascript with JSDoc comments",
            },
            { value: "js", label: "No" },
          ],
        }),
    });
  },
  async apply(
    { projectDir, useGelAuth }: BaseOptions,
    { lang }: SveltekitOptions,
  ) {
    logger("Running Sveltekit recipe");

    const dirname = path.dirname(new URL(import.meta.url).pathname);

    let tags;
    if (useGelAuth) {
      tags = new Set<string>(["auth"]);
    }

    await copyTemplateFiles(path.resolve(dirname, template[lang]), projectDir, {
      tags,
    });

    const isTS = lang === "ts";
    const isJSDoc = lang === "jsdoc";

    await updatePackage(projectDir, {
      type: "module",
      scripts: {
        dev: "vite dev",
        build: "vite build",
        preview: "vite preview",
        ...(isJSDoc && {
          check: "svelte-kit sync && svelte-check --tsconfig ./jsconfig.json",
          "check:watch":
            "svelte-kit sync && svelte-check --tsconfig ./jsconfig.json --watch",
        }),
        ...(isTS && {
          check: "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
          "check:watch":
            "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
        }),
      },
      dependencies: {
        ...(useGelAuth && {
          "@gel/auth-sveltekit": "^0.1.1",
        }),
      },
      devDependencies: {
        "@sveltejs/adapter-auto": "^3.0.0",
        "@sveltejs/kit": "^2.0.0",
        "@sveltejs/vite-plugin-svelte": "^3.0.0",
        svelte: "^4.2.7",
        vite: "^5.0.3",
        ...(isJSDoc && {
          "svelte-check": "^3.6.0",
          typescript: "^5.0.0",
        }),
        ...(isTS && {
          "svelte-check": "^3.6.0",
          typescript: "^5.0.0",
          tslib: "^2.4.1",
        }),
      },
    });
  },
};

export default recipe;
