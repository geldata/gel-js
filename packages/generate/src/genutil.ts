import process from "node:process";
import type { $ } from "gel";
import type * as introspect from "gel/dist/reflection/queries/types";
import { util } from "gel/dist/reflection/index";
import type {
  CodeBuilder,
  CodeFragment,
  DirBuilder,
  IdentRef,
} from "./builders";

export { OperatorKind, StrictMapSet } from "gel/dist/reflection/index";

export { $ } from "gel";

export const splitName = util.splitName;

export const headerComment = `// GENERATED by @gel/generate v__@gel/generate__VERSION_PLACEHOLDER__\n\n`;

export function toIdent(name: string): string {
  if (name.includes("::")) {
    throw new Error(`toIdent: invalid name ${name}`);
  }
  return name.replace(/([^a-zA-Z0-9_]+)/g, "_");
}

export const makePlainIdent = (name: string): string => {
  if (reservedIdents.has(name)) {
    return `$${name}`;
  }
  const replaced = name.replace(
    /[^A-Za-z0-9_]/g,
    (match) => "0x" + match.codePointAt(0)!.toString(16),
  );
  return replaced !== name ? `$${replaced}` : name;
};

export function quote(val: string): string {
  return JSON.stringify(val);
}

export const scalarToLiteralMapping: {
  [key: string]: {
    type: string;
    literalKind?: "typeof" | "instanceof";
    extraTypes?: string[];
    argTypes?: string[];
  };
} = {
  "std::int16": { type: "number" },
  "std::int32": { type: "number" },
  "std::int64": { type: "number", extraTypes: ["string"] },
  "std::float32": { type: "number" },
  "std::float64": { type: "number" },
  "std::number": {
    type: "number",
    literalKind: "typeof",
    extraTypes: ["string"],
  },
  "std::decimal": { type: "string" },
  "std::str": { type: "string", literalKind: "typeof" },
  "std::uuid": { type: "string" },
  "std::json": { type: "unknown" },
  "std::bool": { type: "boolean", literalKind: "typeof" },
  "std::bigint": { type: "bigint", literalKind: "typeof" },
  "std::bytes": { type: "Uint8Array", literalKind: "instanceof" },
  "std::datetime": {
    type: "Date",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "std::duration": {
    type: "gel.Duration",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "cfg::memory": {
    type: "gel.ConfigMemory",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "ext::pgvector::vector": {
    type: "Float32Array",
    literalKind: "instanceof",
    extraTypes: ["number[]"],
    argTypes: ["number[]"],
  },
  // server version >= 6
  // keep this order of mapping, adding firstly mapping as it is in v6 and greater
  // then also add mappings as they are in < v6
  "std::cal::local_datetime": {
    type: "gel.LocalDateTime",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "std::cal::local_date": {
    type: "gel.LocalDate",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "std::cal::local_time": {
    type: "gel.LocalTime",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "std::cal::relative_duration": {
    type: "gel.RelativeDuration",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "std::cal::date_duration": {
    type: "gel.DateDuration",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  // server version < 6
  "cal::local_datetime": {
    type: "gel.LocalDateTime",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "cal::local_date": {
    type: "gel.LocalDate",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "cal::local_time": {
    type: "gel.LocalTime",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "cal::relative_duration": {
    type: "gel.RelativeDuration",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
  "cal::date_duration": {
    type: "gel.DateDuration",
    literalKind: "instanceof",
    extraTypes: ["string"],
  },
};

export function getLiteralToScalarMapping(version: Version) {
  const literalToScalarMapping: {
    [key: string]: { type: string; literalKind: "typeof" | "instanceof" };
  } = {};

  for (const [scalarType, { type, literalKind }] of Object.entries(
    scalarToLiteralMapping,
  )) {
    if (literalKind) {
      if (literalToScalarMapping[type] && version.major > 5) {
        // there's for example gel.LocalTime that maps to the std::cal::local_time
        // if the server version > 5 continue, otherwise overwrite this mapping with cal::local_time
        continue;
      }
      literalToScalarMapping[type] = { type: scalarType, literalKind };
    }
  }
  return literalToScalarMapping;
}

export function toTSScalarType(
  type: introspect.PrimitiveType,
  types: introspect.Types,
  opts: {
    getEnumRef?: (type: introspect.Type) => string;
    gelDatatypePrefix: string;
  } = {
    gelDatatypePrefix: "_.",
  },
): CodeFragment[] {
  switch (type.kind) {
    case "scalar": {
      if (type.enum_values && type.enum_values.length) {
        if (opts.getEnumRef) {
          return [opts.getEnumRef(type)];
        }
        return [getRef(type.name, { prefix: "" })];
      }

      if (type.material_id && !scalarToLiteralMapping[type.name]) {
        return toTSScalarType(
          types.get(type.material_id) as introspect.ScalarType,
          types,
          opts,
        );
      }

      const literalType = scalarToLiteralMapping[type.name]?.type ?? "unknown";
      return [
        (literalType.startsWith("gel.") ? opts.gelDatatypePrefix : "") +
          literalType,
      ];
    }

    case "array": {
      const tn = toTSScalarType(
        types.get(type.array_element_id) as introspect.PrimitiveType,
        types,
        opts,
      );
      return frag`${tn}[]`;
    }

    case "tuple": {
      if (!type.tuple_elements.length) {
        return ["[]"];
      }

      if (
        type.tuple_elements[0]?.name &&
        Number.isNaN(parseInt(type.tuple_elements[0].name, 10))
      ) {
        // a named tuple
        const res = [];
        for (const { name, target_id } of type.tuple_elements) {
          const tn = toTSScalarType(
            types.get(target_id) as introspect.PrimitiveType,
            types,
            opts,
          );
          res.push(frag`${name}: ${tn}`);
        }
        return frag`{${joinFrags(res, ", ")}}`;
      } else {
        // an ordinary tuple
        const res = [];
        for (const { target_id } of type.tuple_elements) {
          const tn = toTSScalarType(
            types.get(target_id) as introspect.PrimitiveType,
            types,
            opts,
          );
          res.push(tn);
        }
        return frag`[${joinFrags(res, ", ")}]`;
      }
    }

    case "range": {
      const tn = toTSScalarType(
        types.get(type.range_element_id) as introspect.PrimitiveType,
        types,
        opts,
      );
      return frag`${opts.gelDatatypePrefix}gel.Range<${tn}>`;
    }

    case "multirange": {
      const tn = toTSScalarType(
        types.get(type.multirange_element_id) as introspect.PrimitiveType,
        types,
        opts,
      );
      return frag`${opts.gelDatatypePrefix}gel.MultiRange<${tn}>`;
    }

    default:
      util.assertNever(type);
  }
}

export function toTSObjectType(
  type: introspect.ObjectType,
  types: introspect.Types,
  currentMod: string,
  code: CodeBuilder,
  level = 0,
): CodeFragment[] {
  if (type.intersection_of && type.intersection_of.length) {
    const res: CodeFragment[][] = [];
    for (const { id: subId } of type.intersection_of) {
      const sub = types.get(subId) as introspect.ObjectType;
      res.push(toTSObjectType(sub, types, currentMod, code, level + 1));
    }
    const ret = joinFrags(res, " & ");
    return level > 0 ? frag`(${ret})` : ret;
  }

  if (type.union_of && type.union_of.length) {
    const res: CodeFragment[][] = [];
    for (const { id: subId } of type.union_of) {
      const sub = types.get(subId) as introspect.ObjectType;
      res.push(toTSObjectType(sub, types, currentMod, code, level + 1));
    }
    const ret = joinFrags(res, " | ");
    return level > 0 ? frag`(${ret})` : ret;
  }

  return [getRef(type.name, { prefix: "" })];
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// convert FQN into capital camel case
export function displayName(str: string) {
  const { name } = splitName(str);
  const stripped =
    "$" +
    name
      .replace(/[^$0-9a-zA-Z]/g, " ")
      .split(" ")
      .filter((x) => !!x)
      .map(capitalize)
      .join("");
  // if (stripped === "Object") return `ObjectType`;
  return stripped;
}

export function getInternalName({ fqn, id }: { fqn: string; id: string }) {
  const { name } = splitName(fqn);
  return makeValidIdent({ id, name });
}

export function makeValidIdent({
  id,
  name,
  skipKeywordCheck,
}: {
  id: string;
  name: string;
  skipKeywordCheck?: boolean;
}) {
  let strippedName = name.replace(/^_|[^A-Za-z0-9_]/g, "");

  if (
    strippedName !== name ||
    (!skipKeywordCheck && reservedIdents.has(strippedName))
  ) {
    strippedName += `_${id.toLowerCase().replace(/[^0-9a-f]/g, "")}`;
  }

  return strippedName;
}

export function getRef(name: string, opts?: { prefix?: string }): IdentRef {
  return {
    type: "identRef",
    name,
    opts: {
      prefix: opts?.prefix ?? "$",
    },
  };
}

export function frag(
  strings: TemplateStringsArray,
  ...exprs: (CodeFragment | CodeFragment[])[]
) {
  const frags: CodeFragment[] = [];
  for (let i = 0; i < strings.length; i++) {
    frags.push(strings[i]!);
    if (exprs[i]) {
      if (Array.isArray(exprs[i])) {
        frags.push(...(exprs[i] as CodeFragment[]));
      } else {
        frags.push(exprs[i] as CodeFragment);
      }
    }
  }
  return frags;
}

export function joinFrags(
  frags: (CodeFragment | CodeFragment[])[],
  sep: string,
) {
  const joined: CodeFragment[] = [];
  for (const fragment of frags) {
    joined.push(...(Array.isArray(fragment) ? fragment : [fragment]), sep);
  }
  return joined.slice(0, -1);
}

export const reservedIdents = new Set([
  "do",
  "if",
  "in",
  "for",
  "let",
  "new",
  "try",
  "var",
  "case",
  "else",
  "enum",
  "eval",
  "null",
  "this",
  "true",
  "void",
  "with",
  "await",
  "break",
  "catch",
  "class",
  "const",
  "false",
  "super",
  "throw",
  "while",
  "yield",
  "delete",
  "export",
  "import",
  "public",
  "return",
  "static",
  "switch",
  "typeof",
  "default",
  "extends",
  "finally",
  "package",
  "private",
  "continue",
  "debugger",
  "function",
  "arguments",
  "interface",
  "protected",
  "implements",
  "instanceof",
  "Object",
]);

export async function writeDirWithTarget(
  dir: DirBuilder,
  target: Target,
  params: { outputDir: string; written?: Set<string> },
) {
  const { outputDir, written = new Set<string>() } = params;
  if (target === "ts") {
    await dir.write(outputDir, {
      mode: "ts",
      moduleKind: "esm",
      fileExtension: ".ts",
      moduleExtension: "",
      written,
    });
  } else if (target === "mts") {
    await dir.write(outputDir, {
      mode: "ts",
      moduleKind: "esm",
      fileExtension: ".mts",
      moduleExtension: ".mjs",
      written,
    });
  } else if (target === "cjs") {
    await dir.write(outputDir, {
      mode: "js",
      moduleKind: "cjs",
      fileExtension: ".js",
      moduleExtension: "",
      written,
    });
    await dir.write(outputDir, {
      mode: "dts",
      moduleKind: "esm",
      fileExtension: ".d.ts",
      moduleExtension: "",
      written,
    });
  } else if (target === "esm") {
    await dir.write(outputDir, {
      mode: "js",
      moduleKind: "esm",
      fileExtension: ".mjs",
      moduleExtension: ".mjs",
      written,
    });
    await dir.write(outputDir, {
      mode: "dts",
      moduleKind: "esm",
      fileExtension: ".d.mts",
      moduleExtension: "",
      written,
    });
  } else if (target === "deno") {
    await dir.write(outputDir, {
      mode: "ts",
      moduleKind: "esm",
      fileExtension: ".ts",
      moduleExtension: ".ts",
      written,
    });
  }
}

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

export function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error();
}

export type Target = "ts" | "esm" | "cjs" | "mts" | "deno";
export type Version = {
  major: number;
  minor: number;
};
