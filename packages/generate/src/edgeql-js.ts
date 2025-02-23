import { promises as fs } from "node:fs";
import path from "node:path";
import { $, systemUtils, type Client } from "gel";
import { type CommandOptions, isTTY, promptBoolean } from "./commandutil";
import { headerComment } from "./genutil";
import { DirBuilder } from "./builders";
import { syntax } from "./FILES";

import { generateCastMaps } from "./edgeql-js/generateCastMaps";
import { generateFunctionTypes } from "./edgeql-js/generateFunctionTypes";
import { generateGlobals } from "./edgeql-js/generateGlobals";
import { generateIndex } from "./edgeql-js/generateIndex";
import { generateObjectTypes } from "./edgeql-js/generateObjectTypes";
import { generateOperators } from "./edgeql-js/generateOperatorTypes";
import { generateRuntimeSpec } from "./edgeql-js/generateRuntimeSpec";
import { generateScalars } from "./edgeql-js/generateScalars";
import { generateSetImpl } from "./edgeql-js/generateSetImpl";

const { readFileUtf8, exists, walk } = systemUtils;

export const configFileHeader = `// Gel query builder`;

export type GeneratorParams = {
  dir: DirBuilder;
  types: $.introspect.Types;
  typesByName: Record<string, $.introspect.Type>;
  casts: $.introspect.Casts;
  scalars: $.introspect.ScalarTypes;
  functions: $.introspect.FunctionTypes;
  globals: $.introspect.Globals;
  operators: $.introspect.OperatorTypes;
  gelVersion: Version;
};

export type Target = "ts" | "esm" | "cjs" | "mts" | "deno";
export type Version = {
  major: number;
  minor: number;
};

export const defaultFutureFlags = {
  polymorphismAsDiscriminatedUnions: false,
  strictTypeNames: false,
};

export async function generateQueryBuilder(params: {
  root: string | null;
  options: CommandOptions;
  client: Client;
  schemaDir: string;
}) {
  const { root, options, client: cxn, schemaDir } = params;

  let outputDir: string;
  if (options.out) {
    outputDir = path.isAbsolute(options.out)
      ? options.out
      : path.join(process.cwd(), options.out);
  } else if (root) {
    outputDir = path.join(root, schemaDir, "edgeql-js");
  } else {
    throw new Error(
      "No project config file found. Initialize an Gel project with\n" +
        "'gel project init' or specify an output directory with '--output-dir'",
    );
  }

  let outputDirIsInProject = false;
  let prettyOutputDir;
  if (root) {
    const relativeOutputDir = path.posix.relative(root, outputDir);
    outputDirIsInProject =
      // !!relativeOutputDir &&
      // !path.isAbsolute(options.outputDir) &&
      !relativeOutputDir.startsWith("..");
    prettyOutputDir = outputDirIsInProject
      ? `./${relativeOutputDir}`
      : outputDir;
  } else {
    prettyOutputDir = outputDir;
  }

  if (await exists(outputDir)) {
    if (await canOverwrite(outputDir, options)) {
      // await rmdir(outputDir, {recursive: true});
    }
  } else {
    // output dir doesn't exist, so assume first run
    options.updateIgnoreFile ??= true;
  }

  // generate query builder
  const target = options.target!;

  const dir = new DirBuilder();

  console.log(`Introspecting database schema...`);

  const [types, scalars, casts, functions, operators, globals, version] =
    await Promise.all([
      $.introspect.types(cxn),
      $.introspect.scalars(cxn),
      $.introspect.casts(cxn),
      $.introspect.functions(cxn),
      $.introspect.operators(cxn),
      $.introspect.globals(cxn),
      cxn.queryRequiredSingle<Version>(`select sys::get_version()`),
    ]);

  const typesByName: Record<string, $.introspect.Type> = {};
  for (const type of types.values()) {
    typesByName[type.name] = type;

    // skip "anytype" and "anytuple"
    if (!type.name.includes("::")) continue;
  }

  const generatorParams: GeneratorParams = {
    dir,
    types,
    typesByName,
    casts,
    scalars,
    functions,
    globals,
    operators,
    gelVersion: version,
  };
  console.log("Generating runtime spec...");
  generateRuntimeSpec(generatorParams);
  console.log("Generating cast maps...");
  generateCastMaps(generatorParams);
  console.log("Generating scalars...");
  generateScalars(generatorParams);
  console.log("Generating object types...");
  generateObjectTypes(generatorParams);
  console.log("Generating function types...");
  generateFunctionTypes(generatorParams);
  console.log("Generating operators...");
  generateOperators(generatorParams);
  console.log("Generating set impl...");
  generateSetImpl(generatorParams);
  console.log("Generating globals...");
  generateGlobals(generatorParams);

  if (version.major < 4) {
    dir._modules.delete("fts");
    dir._map.delete("modules/fts");
  }

  console.log("Generating index...");
  generateIndex(generatorParams);

  // generate module imports

  const importsFile = dir.getPath("imports");

  importsFile.addExportStar("gel", { as: "gel" });
  importsFile.addExportFrom({ spec: true }, "./__spec__", {
    allowFileExt: true,
  });
  importsFile.addExportStar("./syntax", {
    allowFileExt: true,
    as: "syntax",
  });
  importsFile.addExportStar("./castMaps", {
    allowFileExt: true,
    as: "castMaps",
  });

  const initialFiles = new Set(await walk(outputDir));
  const written = new Set<string>();

  // write syntax files
  const syntaxOutDir = path.join(outputDir);
  if (!(await exists(syntaxOutDir))) {
    await fs.mkdir(syntaxOutDir);
  }

  const syntaxFiles = syntax[target];
  if (!syntaxFiles) {
    throw new Error(`Error: no syntax files found for target "${target}"`);
  }

  // libs that existed in modules/[lib] and in server v6 moved to modules/std/[lib]
  const stdLibs = ["cal", "fts", "math", "pg"];

  // instead of hardcoding we can check generated files inside modules/std
  // if (version.major > 5) {
  //   const stdPath = path.join(prettyOutputDir, "modules", "std");
  //   const filenames = await fs.readdir(stdPath);

  //   for (const fname of filenames) {
  //     const fullPath = path.join(stdPath, fname);
  //     const fileStat = await fs.stat(fullPath);

  //     if (fileStat.isFile()) {
  //       const libName = path.parse(fname).name;
  //       stdLibs.push(libName);
  //     }
  //   }
  // }

  for (const f of syntaxFiles) {
    const outputPath = path.join(syntaxOutDir, f.path);
    written.add(outputPath);

    const oldContents = await readFileUtf8(outputPath)
      .then((content) => content)
      .catch(() => "");

    let newContents = headerComment + f.content;

    // in server versions >=6 cal, fts, math and pg are moved inside std module
    if (version.major > 5) {
      stdLibs.forEach((lib) => {
        newContents = newContents.replace(
          `modules/${lib}`,
          `modules/std/${lib}`,
        );
      });
    }

    if (oldContents !== newContents) {
      await fs.writeFile(outputPath, newContents);
    }
  }

  const future = {
    ...defaultFutureFlags,
    ...options.future,
  };

  const futureFilePath = path.join(syntaxOutDir, "future.ts");

  const content =
    headerComment +
    `export const future = ${JSON.stringify(future, undefined, 2)} as const;\n`;

  await fs.writeFile(futureFilePath, content);
  written.add(futureFilePath);

  if (target === "ts") {
    await dir.write(
      outputDir,
      {
        mode: "ts",
        moduleKind: "esm",
        fileExtension: ".ts",
        moduleExtension: "",
        written,
      },
      headerComment,
    );
  } else if (target === "mts") {
    await dir.write(
      outputDir,
      {
        mode: "ts",
        moduleKind: "esm",
        fileExtension: ".mts",
        moduleExtension: ".mjs",
        written,
      },
      headerComment,
    );
  } else if (target === "cjs") {
    await dir.write(
      outputDir,
      {
        mode: "js",
        moduleKind: "cjs",
        fileExtension: ".js",
        moduleExtension: "",
        written,
      },
      headerComment,
    );
    await dir.write(
      outputDir,
      {
        mode: "dts",
        moduleKind: "esm",
        fileExtension: ".d.ts",
        moduleExtension: "",
        written,
      },
      headerComment,
    );
  } else if (target === "esm") {
    await dir.write(
      outputDir,
      {
        mode: "js",
        moduleKind: "esm",
        fileExtension: ".mjs",
        moduleExtension: ".mjs",
        written,
      },
      headerComment,
    );
    await dir.write(
      outputDir,
      {
        mode: "dts",
        moduleKind: "esm",
        fileExtension: ".d.ts",
        moduleExtension: "",
        written,
      },
      headerComment,
    );
  } else if (target === "deno") {
    await dir.write(
      outputDir,
      {
        mode: "ts",
        moduleKind: "esm",
        fileExtension: ".ts",
        moduleExtension: ".ts",
        written,
      },
      headerComment,
    );
  }

  const configPath = path.join(outputDir, "config.json");
  await fs.writeFile(
    configPath,
    `${configFileHeader}\n${JSON.stringify({ target })}\n`,
  );
  written.add(configPath);

  // delete all vestigial files
  for (const file of initialFiles) {
    if (written.has(file)) {
      continue;
    }
    await fs.rm(file);
  }

  console.log(`Writing files to ${prettyOutputDir}`);
  console.log(`Generation complete! 🤘`);

  if (!outputDirIsInProject || !root) {
    console.log(
      `\nChecking the generated files into version control is
not recommended. Consider updating the .gitignore of your
project to exclude these files.`,
    );
  } else if (options.updateIgnoreFile) {
    const gitIgnorePath = path.join(root, ".gitignore");

    const gitIgnoreFile = await readFileUtf8(gitIgnorePath)
      .then((content) => content)
      .catch(() => null);

    const vcsLine = path.posix.relative(root, outputDir);

    if (
      gitIgnoreFile === null ||
      !RegExp(`^${vcsLine}$`, "m").test(gitIgnoreFile) // not already ignored
    ) {
      if (
        isTTY() &&
        (await promptBoolean(
          gitIgnoreFile === null
            ? `Checking the generated query builder into version control
is not recommended. Would you like to create a .gitignore file to ignore
the query builder directory? `
            : `Checking the generated query builder into version control
is not recommended. Would you like to update .gitignore to ignore
the query builder directory? The following line will be added:

   ${vcsLine}\n\n`,
          true,
        ))
      ) {
        await fs.appendFile(
          gitIgnorePath,
          `${gitIgnoreFile === null ? "" : "\n"}${vcsLine}\n`,
        );
      }
    }
  }
}

async function canOverwrite(outputDir: string, options: CommandOptions) {
  if (options.forceOverwrite) {
    return true;
  }

  let config: any = null;
  try {
    const configFile = await readFileUtf8(path.join(outputDir, "config.json"));
    if (configFile.startsWith(configFileHeader)) {
      config = JSON.parse(configFile.slice(configFileHeader.length));

      if (config.target === options.target) {
        return true;
      }
    }
    // eslint-disable-next-line no-empty
  } catch {}

  const error = config
    ? `Error: A query builder with a different config already exists in that location.`
    : `Error: Output directory '${outputDir}' already exists.`;

  if (
    isTTY() &&
    (await promptBoolean(`${error}\nDo you want to overwrite? `, true))
  ) {
    return true;
  }

  throw new Error(error);
}
