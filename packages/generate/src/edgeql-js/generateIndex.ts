import { dts, r, t } from "../builders";
import type { GeneratorParams } from "../genutil";
import * as genutil from "../genutil";

export function generateIndex(params: GeneratorParams) {
  /////////////////////////
  // generate index file
  /////////////////////////
  const { dir } = params;
  const index = dir.getPath("index");
  // index.addExportStar(null, "./castMaps", true);
  index.addExportStar("./external", {
    allowFileExt: true,
  });
  // index.addExportStar("./types", {
  //   allowFileExt: true,
  //   modes: ["ts", "dts", "js"]
  // });

  index.addImportStar("$", "./reflection");
  index.addExportFrom({ createClient: true }, "gel");
  index.addImportStar("$syntax", "./syntax", { allowFileExt: true });
  index.addImportStar("$op", "./operators", { allowFileExt: true });

  const spreadModules = [
    {
      name: "$op",
      keys: ["op"],
    },
    {
      name: "$syntax",
      keys: [
        "ASC",
        "DESC",
        "EMPTY_FIRST",
        "EMPTY_LAST",
        "alias",
        "array",
        "cast",
        "detached",
        "for",
        "insert",
        "is",
        "literal",
        "namedTuple",
        "optional",
        "select",
        "set",
        "tuple",
        "with",
        "withParams",
      ],
    },
    {
      name: "_default",
      module: dir.getModule("default"),
    },
    { name: "_std", module: dir.getModule("std") },
  ];

  const topLevelModules = new Map(
    [...dir._modules.entries()].filter(([_, path]) => path.length === 1),
  );
  const excludedKeys = new Set<string>(topLevelModules.keys());

  const spreadTypes: string[] = [];
  for (const { name, keys: providedKeys, module } of spreadModules) {
    if (module?.isEmpty()) {
      continue;
    }
    const keys = providedKeys ?? module!.getDefaultExportKeys();
    const conflictingKeys = keys.filter((key) => excludedKeys.has(key));
    let typeStr: string;
    if (conflictingKeys.length) {
      typeStr = `Omit<typeof ${name}, ${conflictingKeys
        .map(genutil.quote)
        .join(" | ")}>`;
    } else {
      typeStr = `typeof ${name}`;
    }
    spreadTypes.push(
      name === "$syntax" ? `$.util.OmitDollarPrefixed<${typeStr}>` : typeStr,
    );
    for (const key of keys) {
      excludedKeys.add(key);
    }
  }

  index.nl();
  index.writeln([
    dts`declare `,
    `const ExportDefault`,
    t`: ${spreadTypes.reverse().join(" & \n  ")} & {`,
  ]);
  const defaultSpreadTypes = new Set(
    dir.getModule("default").getDefaultExportKeys(),
  );
  index.indented(() => {
    for (const [moduleName, internalName] of topLevelModules) {
      if (dir.getModule(moduleName).isEmpty()) continue;
      let typeStr = `typeof _${internalName}`;
      if (defaultSpreadTypes.has(moduleName)) {
        typeStr += ` & typeof _default.${moduleName}`;
      }
      index.writeln([t`${genutil.quote(moduleName)}: ${typeStr};`]);
    }
  });

  index.writeln([t`}`, r` = {`]);
  index.indented(() => {
    for (const { name, module } of [...spreadModules].reverse()) {
      if (module?.isEmpty()) {
        continue;
      }
      index.writeln([
        r`...${
          name === "$syntax" ? `$.util.omitDollarPrefixed($syntax)` : name
        },`,
      ]);
    }

    for (const [moduleName, internalName] of topLevelModules) {
      if (dir.getModule(moduleName).isEmpty()) {
        continue;
      }
      index.addImportDefault(`_${internalName}`, `./modules/${internalName}`, {
        allowFileExt: true,
      });

      const valueStr = defaultSpreadTypes.has(moduleName)
        ? `Object.freeze({ ..._${internalName}, ..._default.${moduleName} })`
        : `_${internalName}`;
      index.writeln([r`${genutil.quote(moduleName)}: ${valueStr},`]);
    }
  });
  index.writeln([r`};`]);
  index.addExportDefault("ExportDefault");

  // re-export some reflection types
  index.writeln([r`const Cardinality = $.Cardinality;`]);
  index.writeln([dts`declare `, t`type Cardinality = $.Cardinality;`]);
  index.addExport("Cardinality");
  index.writeln([
    t`export `,
    dts`declare `,
    t`type Set<
  Type extends $.BaseType,
  Card extends $.Cardinality = $.Cardinality.Many
> = $.TypeSet<Type, Card>;`,
  ]);
}
