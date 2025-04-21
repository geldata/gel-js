import { CodeBuffer, dts, r, t, ts, all } from "../builders";
import type { GeneratorParams } from "../genutil";
import {
  getRef,
  joinFrags,
  getLiteralToScalarMapping,
  quote,
  scalarToLiteralMapping,
} from "../genutil";
import { $ } from "../genutil";
import { getStringRepresentation } from "./generateObjectTypes";

const getRuntimeRef = (name: string) => getRef(name, { prefix: "" });

export const generateCastMaps = (params: GeneratorParams) => {
  const { dir, types, casts, typesByName, gelVersion } = params;
  const { implicitCastMap } = casts;

  const literalToScalarMapping = getLiteralToScalarMapping(gelVersion);

  const f = dir.getPath("castMaps");
  f.addImportStar("gel", "gel");
  f.addImportStar("$", "./reflection", {
    modes: ["ts", "dts"],
    allowFileExt: true,
    typeOnly: true,
  });

  const reverseTopo = Array.from(types)
    .reverse() // reverse topological order
    .map(([_, type]) => type);

  /////////////////////////////////////
  // generate implicit scalar mapping
  /////////////////////////////////////

  const materialScalars = reverseTopo.filter(
    (type) => type.kind === "scalar" && !type.is_abstract,
    // && (!type.enum_values || !type.enum_values.length)
  );

  const casting = (id: string) => {
    const type = types.get(id);
    const castable = $.util.deduplicate([
      ...$.util.getFromArrayMap(implicitCastMap, type.id),
    ]);
    return castable;
  };

  const assignableMap = new CodeBuffer();
  assignableMap.writeln([
    t`export `,
    dts`declare `,
    t`interface ScalarAssignableByMap {`,
  ]);
  const castableMap = new CodeBuffer();
  castableMap.writeln([
    t`export `,
    dts`declare `,
    t`interface ScalarCastableFromMap {`,
  ]);

  const staticMap = new CodeBuffer();
  staticMap.writeln([dts`declare `, t`type getSharedParentScalar<A, B> =`]);
  staticMap.increaseIndent();
  staticMap.writeln([t`A extends $.ScalarType<infer AName> ?`]);
  staticMap.writeln([t`B extends $.ScalarType<infer BName> ?`]);
  staticMap.increaseIndent();

  const runtimeMap = new CodeBuffer();

  const returnTypes = new Set<string>();

  const uncastables = new Set(
    materialScalars.filter(
      (outer) =>
        // can't be cast into something else
        casting(outer.id).length === 0 &&
        // nothing else can be cast into this
        materialScalars.filter((inner) => {
          return casting(inner.id).includes(outer.id);
        }).length === 0,
    ),
  );

  for (const outer of materialScalars) {
    assignableMap.writeln([
      t`  "${outer.name}": ${
        getStringRepresentation(types.get(outer.id), {
          types,
          casts: casts.assignableByMap,
          castSuffix: "λIAssignableBy",
        }).staticType
      };`,
    ]);
    castableMap.writeln([
      t`  "${outer.name}": ${
        getStringRepresentation(types.get(outer.id), {
          types,
          casts: casts.implicitCastFromMap,
          castSuffix: "λICastableTo",
        }).staticType
      };`,
    ]);

    const outerCastableTo = casting(outer.id);
    if (!uncastables.has(outer)) {
      staticMap.writeln([t`AName extends "${outer.name}" ?`]);
    }
    runtimeMap.writeln([r`  if (a.__name__ === ${quote(outer.name)}) {`]);

    staticMap.increaseIndent();
    for (const inner of materialScalars) {
      const innerCastableTo = casting(inner.id);
      const sameType = inner.name === outer.name;
      const aCastableToB = outerCastableTo.includes(inner.id);
      const bCastableToA = innerCastableTo.includes(outer.id);

      let sharedParent: string | null = null;
      const sharedParentId = outerCastableTo.find((type) =>
        innerCastableTo.includes(type),
      );
      if (sharedParentId) {
        const sharedParentName = types.get(sharedParentId).name;
        sharedParent = sharedParentName;
      }

      const validCast =
        sameType || aCastableToB || bCastableToA || sharedParent;

      if (validCast) {
        if (!uncastables.has(inner)) {
          staticMap.writeln([t`BName extends "${inner.name}" ?`]);
        }
        runtimeMap.writeln([r`    if(b.__name__ === ${quote(inner.name)}) {`]);

        if (sameType) {
          if (!uncastables.has(inner)) {
            staticMap.writeln([t`  B`]);
          }
          runtimeMap.writeln([r`      return b;`]);
        } else if (aCastableToB) {
          staticMap.writeln([t`  B`]);
          runtimeMap.writeln([r`      return b;`]);
        } else if (bCastableToA) {
          staticMap.writeln([t`  A`]);
          runtimeMap.writeln([r`      return a;`]);
        } else if (sharedParent) {
          staticMap.writeln([t`    ${getRef(sharedParent)}`]);
          runtimeMap.writeln([r`      return ${getRuntimeRef(sharedParent)};`]);
          returnTypes.add(sharedParent);
        } else {
          staticMap.writeln([t`never`]);
          runtimeMap.writeln([
            r`      throw new Error(\`Types are not castable: \${a.__name__}, \${b.__name__}\`);`,
          ]);
        }
        if (!uncastables.has(inner)) {
          staticMap.writeln([t`:`]);
        }
        runtimeMap.writeln([r`    }`]);
      }
    }
    staticMap.decreaseIndent();

    if (!uncastables.has(outer)) {
      staticMap.writeln([t`  never`]);
      staticMap.writeln([t`:`]);
    }
    runtimeMap.writeln([
      r`    throw new Error(\`Types are not castable: \${a.__name__}, \${b.__name__}\`);`,
    ]);
    runtimeMap.writeln([r`    }`]);
  }
  assignableMap.writeln([t`}\n`]);
  castableMap.writeln([t`}\n`]);
  staticMap.writeln([t`AName extends BName ? A : never`]);
  staticMap.decreaseIndent();
  staticMap.writeln([t`: never : never;\n`]);
  runtimeMap.writeln([
    r`  throw new Error(\`Types are not castable: \${a.__name__}, \${b.__name__}\`);`,
  ]);
  runtimeMap.writeln([r`}\n`]);

  f.writeBuf(assignableMap);
  f.writeln([
    t`export `,
    dts`declare `,
    t`type scalarAssignableBy<T extends $.ScalarType> =
  T extends $.ScalarType<infer N extends keyof ScalarAssignableByMap>
    ? ScalarAssignableByMap[N]
    : never\n`,
  ]);
  f.nl();
  f.writeBuf(castableMap);
  f.writeln([
    t`export `,
    dts`declare `,
    t`type scalarCastableFrom<T extends $.ScalarType> =
  T extends $.ScalarType<infer N extends keyof ScalarCastableFromMap>
    ? ScalarCastableFromMap[N]
    : never\n`,
  ]);
  f.nl();
  f.writeBuf(staticMap);
  f.nl();

  f.writeln([
    dts`declare `,
    `function getSharedParentScalar`,
    t`<A extends $.ScalarType, B extends $.ScalarType>`,
    `(a`,
    t`: A`,
    `, b`,
    t`: B`,
    `)`,
    t`: ${joinFrags(
      ["A", "B", ...[...returnTypes].map((type) => getRef(type))],
      " | ",
    )}`,
    r` {`,
  ]);
  f.writeln([r`  a = (a`, ts` as any`, r`).__casttype__ || a;`]);
  f.writeln([r`  b = (b`, ts` as any`, r`).__casttype__ || b;`]);
  f.addExport("getSharedParentScalar");
  f.writeBuf(runtimeMap);

  // const userDefinedObjectTypes = reverseTopo.filter((type) => {
  //   if (type.kind !== "object") return false;
  //   if (type.name.includes("schema::")) return false;
  //   if (type.name.includes("sys::")) return false;
  //   if (type.name.includes("cfg::")) return false;
  //   if (type.name.includes("seq::")) return false;
  //   if (type.name.includes("stdgraphql::")) return false;
  //   if (
  //     !type.ancestors
  //       .map((t) => t.id)
  //       .includes(typesByName["std::Object"].id) &&
  //     type.name !== "std::Object"
  //   ) {
  //     return false;
  //   }
  //   return true;
  // });

  // generateCastMap({
  //   materialScalars: materialScalars,
  //   casting: (id: string) => {
  //     const type = types.get(id);

  //     const castable = util.deduplicate([
  //       ...util.getFromArrayMap(implicitCastMap, type.id),
  //     ]);

  //     return castable;
  //   },
  //   file: f,
  //   mapName: "getSharedParentScalar",
  // });

  f.nl();

  // generateCastMap({
  //   materialScalars: userDefinedObjectTypes,
  //   casting: (id: string) => {
  //     const type = types.get(id);
  //     return util.deduplicate([
  //       ...(type.kind === "object" ? type.ancestors.map((a) => a.id) : []),
  //     ]);
  //   },
  //   file: f,
  //   mapName: "getSharedParentObject",
  //   baseCase: "std::Object",
  // });

  f.writeln([
    r`const implicitCastMap = new Map`,
    ts`<string, Set<string>>`,
    r`([`,
  ]);
  f.indented(() => {
    for (const [sourceId, castableTo] of Object.entries(
      casts.implicitCastMap,
    )) {
      if (castableTo.length) {
        f.writeln([
          r`[${quote(types.get(sourceId).name)}, new Set([${castableTo
            .map((targetId) => quote(types.get(targetId).name))
            .join(", ")}])],`,
        ]);
      }
    }
  });
  f.writeln([r`]);`]);
  f.writeln([
    dts`declare `,
    `function isImplicitlyCastableTo(from`,
    t`: string`,
    `, to`,
    t`: string`,
    `)`,
    t`: boolean`,
    r` {
  const _a = implicitCastMap.get(from),
        _b = _a != null ? _a.has(to) : null;
  return _b != null ? _b : false;
};\n\n`,
  ]);
  f.addExport("isImplicitlyCastableTo");

  // scalar literals mapping //

  f.writeln([
    t`export `,
    dts`declare `,
    t`type scalarLiterals =\n  | ${Object.keys(literalToScalarMapping).join(
      "\n  | ",
    )}\n  | gel.Range<any> | gel.MultiRange<any>;\n\n`,
  ]);

  f.writeln([
    dts`declare `,
    t`type getTsType<T extends $.BaseType> = T extends $.ScalarType`,
  ]);
  f.writeln([
    t`  ? T extends ${joinFrags(
      [...types.values()]
        .filter((type) => {
          return (
            type.kind === "scalar" &&
            !type.is_abstract &&
            !type.enum_values &&
            !type.material_id &&
            !type.cast_type &&
            !scalarToLiteralMapping[type.name]?.literalKind
          );
        })
        .map((scalar) => getRef(scalar.name)),
      " | ",
    )}`,
  ]);
  f.writeln([t`    ? never`]);
  f.writeln([t`    : T["__tstype__"]`]);
  f.writeln([t`  : T extends $.RangeType`]);
  f.writeln([t`  ? gel.Range<T['__element__']['__tstype__']>`]);
  f.writeln([t`  : T extends $.MultiRangeType`]);
  f.writeln([t`  ? gel.MultiRange<T['__element__']['__tstype__']>`]);
  f.writeln([t`  : never;`]);
  f.writeln([
    t`export `,
    dts`declare `,
    t`type orScalarLiteral<T extends $.TypeSet> =`,
  ]);
  f.writeln([t`  | T`]);
  f.writeln([
    t`  | ($.BaseTypeSet extends T`,
    t`      ? scalarLiterals`,
    t`      : $.Cardinality extends T["__cardinality__"]`,
    t`        ? getTsType<T["__element__"]>`,
    t`        : $.computeTsTypeCard<`,
    t`            getTsType<T["__element__"]>,`,
    t`            T["__cardinality__"]`,
    t`          >);`,
  ]);
  //  ? scalarLiterals : getTsType<T["__element__"]>);\n\n

  f.writeln([
    t`export `,
    dts`declare `,
    t`type scalarWithConstType<
  T extends $.ScalarType,
  TsConstType
> = $.ScalarType<
  T["__name__"],
  T["__tstype__"],
  T['__tsargtype__'],
  TsConstType
>;`,
  ]);

  f.writeln([
    t`export `,
    dts`declare `,
    t`type literalToScalarType<T extends any> =`,
  ]);
  for (const [literal, { type }] of Object.entries(literalToScalarMapping)) {
    // skip date_duration on v1 instances
    if (!typesByName[type]) continue;
    f.writeln([
      t`  T extends ${literal} ? scalarWithConstType<${getRef(type)}, T> :`,
    ]);
  }
  f.writeln([
    t`  T extends gel.Range<infer E> ? $.RangeType<literalToScalarType<E>> :`,
  ]);
  f.writeln([
    t`  T extends gel.MultiRange<infer E> ? $.MultiRangeType<literalToScalarType<E>> :`,
  ]);
  // todo probably should be ScalarType or never
  f.writeln([t`  $.BaseType;\n\n`]);

  f.writeln([
    dts`declare `,
    t`type literalToTypeSet<T extends any> = T extends $.TypeSet`,
  ]);
  f.writeln([t`  ? T`]);
  f.writeln([t`  : $.$expr_Literal<literalToScalarType<T>>;\n\n`]);

  f.writeln([t`export `, dts`declare `, t`type mapLiteralToTypeSet<T> = {`]);
  f.writeln([t`  [k in keyof T]: literalToTypeSet<T[k]>;`]);
  f.writeln([t`};\n\n`]);

  f.addImportStar("literal", "./literal", { allowFileExt: true });

  f.writeln([
    dts`declare `,
    all`function literalToTypeSet(type`,
    t`: any`,
    all`)`,
    t`: $.TypeSet`,
    dts`;`,
    r` {`,
  ]);
  f.writeln([r`  if (type && type.__element__) {`]);
  f.writeln([r`    return type;`]);
  f.writeln([r`  }`]);
  for (const [literalType, { literalKind, type }] of Object.entries(
    literalToScalarMapping,
  )) {
    const fullType = typesByName[type];
    // cal::date_duration won't be defined on v1 instances
    if (!fullType) continue;

    if (literalKind === "typeof") {
      f.writeln([r`  if (typeof type === "${literalType}") {`]);
    } else {
      f.writeln([r`  if (type instanceof ${literalType}) {`]);
    }

    f.writeln([r`    return literal.$getType("${fullType.id}")(type);`]);

    f.writeln([r`  }`]);
  }
  f.writeln([
    r`  throw new Error(\`Cannot convert literal '\${type}' into scalar type\`);`,
  ]);
  f.writeln([r`}`]);
  f.addExport("literalToTypeSet");
};
