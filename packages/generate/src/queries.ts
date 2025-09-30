import path from "node:path";
import { promises as fs } from "node:fs";
import {
  $,
  _CodecsRegistry,
  _ScalarCodec,
  systemUtils,
  type Client,
  type Executor,
} from "gel";
import { type CommandOptions } from "./commandutil";
import { headerComment } from "./genutil";
import type { Target } from "./genutil";

const { readFileUtf8 } = systemUtils;

// generate per-file queries
// generate queries in a single file
// generate per-file queries, then listen for changes and update
export async function generateQueryFiles(params: {
  root: string | null;
  options: CommandOptions;
  client: Client;
  schemaDir: string;
}) {
  if (params.options.file && params.options.watch) {
    throw new Error(`Using --watch and --file mode simultaneously is not
currently supported.`);
  }

  const noRoot = !params.root;
  const root = params.root ?? process.cwd();
  if (noRoot) {
    console.warn(
      `No project config file found, using process.cwd() as root directory:
   ${params.root}
`,
    );
  } else {
    console.log(`Detected project root via project config file:`);
    console.log("   " + params.root);
  }

  const { client } = params;

  // file mode: introspect all queries and generate one file
  // generate one query per file

  console.log(`Detected schema directory: ${params.schemaDir}`);
  const matches = await getMatches(root, params.options.patterns);
  if (matches.length === 0) {
    const patternMsg = params.options.patterns?.length
      ? ` matching patterns: ${params.options.patterns.join(", ")}`
      : ` outside of ${params.schemaDir}`;
    console.log(`No .edgeql files found${patternMsg}`);
    return;
  }

  console.log(`Connecting to database...`);
  await client.ensureConnected();

  console.log(`Analyzing .edgeql files...`);

  // generate all queries in single file
  if (params.options.file) {
    const filesByExtension: {
      [k: string]: ReturnType<typeof generateFiles>[number];
    } = {};
    let wasError = false;
    await Promise.all(
      matches.map(async (p) => {
        const prettyPath = "./" + path.posix.relative(root, p);

        try {
          const query = await readFileUtf8(p);
          const types = await analyzeQuery(client, query, {
            useResolvedCodecType: params.options.useResolvedCodecType,
          });
          console.log(`   ${prettyPath}`);
          const files = generateFiles({
            target: params.options.target!,
            path: p,
            types,
          });
          for (const f of files) {
            if (!filesByExtension[f.extension]) {
              filesByExtension[f.extension] = f;
            } else {
              filesByExtension[f.extension]!.contents += `\n\n` + f.contents;
              filesByExtension[f.extension]!.imports = filesByExtension[
                f.extension
              ]!.imports.merge(f.imports);
            }
          }
        } catch (err) {
          wasError = true;
          console.log(
            `Error in file '${prettyPath}': ${(err as Error).toString()}`,
          );
        }
      }),
    );
    if (!wasError) {
      console.log(
        `Generating query file${
          Object.keys(filesByExtension).length > 1 ? "s" : ""
        }...`,
      );
      for (const [extension, file] of Object.entries(filesByExtension)) {
        const filePath =
          (path.isAbsolute(params.options.file)
            ? params.options.file
            : path.join(process.cwd(), params.options.file)) + extension;
        const prettyPath = path.isAbsolute(params.options.file)
          ? filePath
          : `./${path.posix.relative(root, filePath)}`;
        console.log(`   ${prettyPath}`);
        await fs.writeFile(
          filePath,
          headerComment +
            `${stringifyImports(file.imports)}\n\n${file.contents}`,
        );
      }
    }
    return;
  }

  async function generateFilesForQuery(p: string) {
    try {
      const query = await readFileUtf8(p);
      if (!query) return;
      const types = await analyzeQuery(client, query, {
        useResolvedCodecType: params.options.useResolvedCodecType,
      });
      const files = generateFiles({
        target: params.options.target!,
        path: p,
        types,
      });
      for (const f of files) {
        const prettyPath = "./" + path.posix.relative(root, f.path);
        console.log(`   ${prettyPath}`);
        await fs.writeFile(
          f.path,
          headerComment + `${stringifyImports(f.imports)}\n\n${f.contents}`,
        );
      }
    } catch (err) {
      console.log(
        `Error in file './${path.posix.relative(root, p)}': ${(
          err as any
        ).toString()}`,
      );
    }
  }

  // generate per-query files
  console.log(`Generating files for following queries:`);
  await Promise.all(matches.map(generateFilesForQuery));

  // find all *.edgeql files
  // for query in queries:
  //   generate output file
}

export function stringifyImports(imports: ImportMap) {
  return [...imports]
    .map(
      ([module, specifiers]) =>
        `import type {${[...specifiers].join(", ")}} from "${module}";`,
    )
    .join("\n");
}

async function getMatches(root: string, patterns?: string[]) {
  // Single code path using globby for both cases
  const { globby } = await import("globby");

  const searchPatterns = patterns && patterns.length > 0 ? patterns : ["."];

  const allFiles = await globby(searchPatterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    expandDirectories: {
      extensions: ["edgeql"],
    },
    ignore: ["node_modules/**", `**/migrations/**`, `**/fixups/**`],
  });

  return allFiles;
}

// const targetToExtension: {[k in Target]: string} = {
//   cjs: ".js",
//   deno: ".ts",
//   esm: ".mjs",
//   mts: ".mts",
//   ts: `.ts`
// };

type QueryType = Awaited<ReturnType<(typeof $)["analyzeQuery"]>>;

export function generateFiles(params: {
  target: Target;
  path: string;
  types: Omit<QueryType, "imports" | "importMap"> &
    Partial<Pick<QueryType, "imports" | "importMap">>;
}): {
  path: string;
  contents: string;
  imports: ImportMap;
  extension: string;
}[] {
  const queryFileName = path.basename(params.path);
  const baseFileName = queryFileName.replace(/\.edgeql$/, "");
  const outputDirname = path.dirname(params.path);
  const outputBaseFileName = path.join(outputDirname, `${baseFileName}.query`);

  const method = cardinalityToExecutorMethod[params.types.cardinality];
  if (!method) {
    const validCardinalities = Object.values($.Cardinality);
    throw new Error(
      `Invalid cardinality: ${
        params.types.cardinality
      }. Expected one of ${validCardinalities.join(", ")}.`,
    );
  }
  const functionName = baseFileName
    .replace(/-[A-Za-z]/g, (m) => m[1]!.toUpperCase())
    .replace(/^[^A-Za-z_]|\W/g, "_");
  const interfaceName =
    functionName.charAt(0).toUpperCase() + functionName.slice(1);
  const argsInterfaceName = `${interfaceName}Args`;
  const returnsInterfaceName = `${interfaceName}Returns`;
  const hasArgs = params.types.args && params.types.args !== "null";
  const queryDefs = `\
${hasArgs ? `export type ${argsInterfaceName} = ${params.types.args};\n` : ""}
export type ${returnsInterfaceName} = ${params.types.result};\
`;
  const functionBody = `\
${params.types.query.trim().replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\`${
    hasArgs ? `, args` : ""
  });
`;

  const tsImports =
    params.types.importMap ??
    new ImportMap(params.types.imports ? [["gel", params.types.imports]] : []);
  tsImports.add("gel", "Executor");

  const tsImpl = `${queryDefs}

export function ${functionName}(client: Executor${
    hasArgs ? `, args: ${argsInterfaceName}` : ""
  }): Promise<${returnsInterfaceName}> {
  return client.${method}(\`\\
${functionBody}
}
`;

  const denoImpl = `
${tsImpl}`;

  const jsImpl = `async function ${functionName}(client${
    hasArgs ? `, args` : ""
  }) {
  return client.${method}(\`\\
${functionBody}
}`;

  const dtsImpl = `${queryDefs}

export function ${functionName}(client: Executor${
    hasArgs ? `, args: ${argsInterfaceName}` : ""
  }): Promise<${returnsInterfaceName}>;`;

  switch (params.target) {
    case "cjs":
      return [
        {
          path: `${outputBaseFileName}.js`,
          contents: `${jsImpl}\n\nmodule.exports.${functionName} = ${functionName};`,
          imports: new ImportMap(),
          extension: ".js",
        },
        {
          path: `${outputBaseFileName}.d.ts`,
          contents: dtsImpl,
          imports: tsImports,
          extension: ".d.ts",
        },
      ];

    case "deno":
      return [
        {
          path: `${outputBaseFileName}.ts`,
          contents: denoImpl,
          imports: tsImports,
          extension: ".ts",
        },
      ];
    case "esm":
      return [
        {
          path: `${outputBaseFileName}.mjs`,
          contents: `export ${jsImpl}`,
          imports: new ImportMap(),
          extension: ".mjs",
        },
        {
          path: `${outputBaseFileName}.d.ts`,
          contents: dtsImpl,
          imports: tsImports,
          extension: ".d.ts",
        },
      ];
    case "mts":
      return [
        {
          path: `${outputBaseFileName}.mts`,
          contents: tsImpl,
          imports: tsImports,
          extension: ".mts",
        },
      ];
    case "ts":
      return [
        {
          path: `${outputBaseFileName}.ts`,
          contents: tsImpl,
          imports: tsImports,
          extension: ".ts",
        },
      ];
  }
}

export const cardinalityToExecutorMethod = {
  One: "queryRequiredSingle",
  AtMostOne: "querySingle",
  Many: "query",
  AtLeastOne: "queryRequired",
  Empty: "query",
} satisfies Record<`${$.Cardinality}`, keyof Executor>;

export class ImportMap extends Map<string, Set<string>> {
  add(module: string, specifier: string) {
    if (!this.has(module)) {
      this.set(module, new Set());
    }
    this.get(module)!.add(specifier);
    return this;
  }

  merge(map: ImportMap) {
    const out = new ImportMap();
    for (const [mod, specifiers] of [...this, ...map]) {
      for (const specifier of specifiers) {
        out.add(mod, specifier);
      }
    }
    return out;
  }
}

const resolvedCodecTypeScalarTypeGenerator = $.defineCodecGeneratorTuple(
  _ScalarCodec,
  (codec, ctx) => {
    if (codec.tsModule) {
      ctx.imports.add(codec.tsModule, codec.tsType);
    }
    const isCustomScalar = !codec.typeName.startsWith("std::");
    if (isCustomScalar) {
      ctx.imports.add("gel", "ResolvedCodecType");
      return `ResolvedCodecType<"${codec.typeName}", ${codec.tsType}>`;
    }
    return codec.tsType;
  },
);

async function analyzeQuery(
  client: Client,
  query: string,
  { useResolvedCodecType }: { useResolvedCodecType?: boolean } = {},
): ReturnType<typeof $.analyzeQuery> {
  const {
    cardinality,
    capabilities,
    in: inCodec,
    out: outCodec,
  } = await client.describe(query);

  const generators = new Map([
    ...$.defaultCodecGenerators.entries(),
    ...(useResolvedCodecType ? [resolvedCodecTypeScalarTypeGenerator] : []),
  ]);

  const args = $.generateTSTypeFromCodec(inCodec, $.Cardinality.One, {
    optionalNulls: true,
    readonly: true,
    generators: generators,
  });
  const result = $.generateTSTypeFromCodec(outCodec, cardinality, {
    generators: generators,
  });

  const imports = args.imports.merge(result.imports);
  return {
    result: result.type,
    args: args.type,
    cardinality,
    capabilities,
    query,
    importMap: imports,
    imports: imports.get("gel") ?? new Set(),
  };
}
