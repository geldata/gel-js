import { type CodeFragment, dts, r, t, ts } from "../builders";
import type { GeneratorParams } from "../genutil";
import type { $ } from "../genutil";
import {
  frag,
  getRef,
  joinFrags,
  // makePlainIdent,
  quote,
  splitName,
  // toTSScalarType
} from "../genutil";

const singletonObjectTypes = new Set(["std::FreeObject"]);

export const getStringRepresentation: (
  type: $.introspect.Type,
  params: {
    types: $.introspect.Types;
    anytype?: string | CodeFragment[];
    casts?: { [key: string]: string[] };
    castSuffix?: string;
  },
) => { staticType: CodeFragment[]; runtimeType: CodeFragment[] } = (
  type,
  params,
) => {
  const suffix = params.castSuffix || `λICastableTo`;
  if (type.name === "anytype") {
    return {
      staticType: frag`${params.anytype ?? `$.BaseType`}`,
      runtimeType: [],
    };
  }
  if (type.name === "anytuple") {
    return {
      staticType: [`$.AnyTupleType`],
      runtimeType: [],
    };
  }
  if (type.name === "anyobject") {
    return {
      staticType: [`$.AnyObjectType`],
      runtimeType: [],
    };
  }
  if (type.name === "std::anypoint") {
    return {
      staticType: frag`${params.anytype ?? getRef("std::anypoint")}`,
      runtimeType: [],
    };
  }
  if (type.name === "std::anyenum") {
    return {
      staticType: [`$.EnumType`],
      runtimeType: [],
    };
  }
  const { types, casts } = params;
  if (type.kind === "object") {
    if (type.name === "std::BaseObject") {
      return {
        staticType: ["$.ObjectType"],
        runtimeType: [getRef(type.name)],
      };
    }
    if (type.union_of?.length) {
      const items = type.union_of.map((it) =>
        getStringRepresentation(types.get(it.id), params),
      );
      return {
        staticType: joinFrags(
          items.map((it) => it.staticType),
          " | ",
        ),
        runtimeType: joinFrags(
          items.map((it) => it.runtimeType),
          " | ",
        ),
      };
    }
    return {
      staticType: [getRef(type.name)],
      runtimeType: [getRef(type.name)],
    };
  } else if (type.kind === "scalar") {
    return {
      staticType: [getRef(type.name), casts?.[type.id]?.length ? suffix : ""],
      runtimeType: [getRef(type.name)],
    };
    // const tsType = toJsScalarType(target, types, mod, body);
  } else if (type.kind === "array") {
    return {
      staticType: frag`$.ArrayType<${
        getStringRepresentation(types.get(type.array_element_id), params)
          .staticType
      }>`,
      runtimeType: frag`$.ArrayType(${
        getStringRepresentation(types.get(type.array_element_id), params)
          .runtimeType
      })`,
    };
  } else if (type.kind === "tuple") {
    const isNamed = type.tuple_elements[0].name !== "0";
    if (isNamed) {
      const itemsStatic = joinFrags(
        type.tuple_elements.map(
          (it) =>
            frag`${it.name}: ${
              getStringRepresentation(types.get(it.target_id), params)
                .staticType
            }`,
        ),
        ", ",
      );
      const itemsRuntime = joinFrags(
        type.tuple_elements.map(
          (it) =>
            frag`${it.name}: ${
              getStringRepresentation(types.get(it.target_id), params)
                .runtimeType
            }`,
        ),
        ", ",
      );

      return {
        staticType: frag`$.NamedTupleType<{${itemsStatic}}>`,
        runtimeType: frag`$.NamedTupleType({${itemsRuntime}})`,
      };
    } else {
      const items = type.tuple_elements
        .map((it) => it.target_id)
        .map((id) => types.get(id))
        .map((el) => getStringRepresentation(el, params));

      return {
        staticType: frag`$.TupleType<[${joinFrags(
          items.map((it) => it.staticType),
          ", ",
        )}]>`,
        runtimeType: frag`$.TupleType([${joinFrags(
          items.map((it) => it.runtimeType),
          ", ",
        )}])`,
      };
    }
  } else if (type.kind === "range") {
    return {
      staticType: frag`$.RangeType<${
        getStringRepresentation(types.get(type.range_element_id), params)
          .staticType
      }>`,
      runtimeType: frag`$.RangeType(${
        getStringRepresentation(types.get(type.range_element_id), params)
          .runtimeType
      })`,
    };
  } else if (type.kind === "multirange") {
    return {
      staticType: frag`$.MultiRangeType<${
        getStringRepresentation(types.get(type.multirange_element_id), params)
          .staticType
      }>`,
      runtimeType: frag`$.MultiRangeType(${
        getStringRepresentation(types.get(type.multirange_element_id), params)
          .runtimeType
      })`,
    };
  } else {
    throw new Error(`Invalid type: ${JSON.stringify(type, null, 2)}`);
  }
};

export const generateObjectTypes = (params: GeneratorParams) => {
  const { dir, types } = params;

  const descendents = generatePolyTypenames(types);

  for (const type of types.values()) {
    if (type.kind !== "object") {
      continue;
    }

    const isUnionType = Boolean(type.union_of?.length);
    const isIntersectionType = Boolean(type.intersection_of?.length);

    if (isIntersectionType || isUnionType) {
      continue;
    }

    const { mod, name } = splitName(type.name);

    const body = dir.getModule(mod);

    body.registerRef(type.name, type.id);

    const ref = getRef(type.name);

    /////////
    // generate interface
    /////////

    type Line = {
      card: string;
      staticType: CodeFragment[];
      runtimeType: CodeFragment[];
      key: string;
      isExclusive: boolean;
      is_computed: boolean;
      is_readonly: boolean;
      hasDefault: boolean;
      kind: "link" | "property";
      lines: Line[];
    };

    const ptrToLine: (
      ptr: $.introspect.Pointer | $.introspect.Backlink,
    ) => Line = (ptr) => {
      const card = `$.Cardinality.${ptr.card}`;
      const target = types.get(ptr.target_id);
      const { staticType, runtimeType } = getStringRepresentation(target, {
        types,
      });

      return {
        key: ptr.name,
        staticType,
        runtimeType,
        card,
        kind: ptr.kind,
        isExclusive: ptr.is_exclusive,
        is_computed: ptr.is_computed ?? false,
        is_readonly: ptr.is_readonly ?? false,
        hasDefault: ptr.has_default ?? false,
        lines: (ptr.pointers ?? [])
          .filter((p) => p.name !== "@target" && p.name !== "@source")
          .map(ptrToLine),
      };
    };

    const lines = [
      ...type.pointers,
      ...type.backlinks,
      ...type.backlink_stubs,
    ].map(ptrToLine);

    // generate shape type
    const fieldNames = new Set(lines.map((l) => l.key));
    const baseTypesUnion = type.bases.length
      ? frag`${joinFrags(
          type.bases.map((base) => {
            const baseType = types.get(base.id) as $.introspect.ObjectType;
            const overloadedFields = [
              ...baseType.pointers,
              ...baseType.backlinks,
              ...baseType.backlink_stubs,
            ]
              .filter((field) => fieldNames.has(field.name))
              .map((field) => quote(field.name));
            const baseRef = getRef(baseType.name);
            return overloadedFields.length
              ? frag`Omit<${baseRef}λShape, ${overloadedFields.join(" | ")}>`
              : frag`${baseRef}λShape`;
          }),
          " & ",
        )} & `
      : ``;
    body.writeln([
      t`export `,
      dts`declare `,
      t`type ${ref}λShape = $.typeutil.flatten<${baseTypesUnion}{`,
    ]);
    body.indented(() => {
      for (const line of lines) {
        if (line.kind === "link") {
          if (!line.lines.length) {
            body.writeln([
              t`${quote(line.key)}: $.LinkDesc<${line.staticType}, ${
                line.card
              }, {}, ${line.isExclusive.toString()}, ${line.is_computed.toString()},  ${line.is_readonly.toString()}, ${line.hasDefault.toString()}>;`,
            ]);
          } else {
            body.writeln([
              t`${quote(line.key)}: $.LinkDesc<${line.staticType}, ${
                line.card
              }, {`,
            ]);
            body.indented(() => {
              for (const linkProp of line.lines) {
                body.writeln([
                  t`${quote(linkProp.key)}: $.PropertyDesc<${
                    linkProp.staticType
                  }, ${linkProp.card}>;`,
                ]);
              }
            });
            body.writeln([
              t`}, ${line.isExclusive.toString()}, ${line.is_computed.toString()}, ${line.is_readonly.toString()}, ${line.hasDefault.toString()}>;`,
            ]);
          }
        } else {
          body.writeln([
            t`${quote(line.key)}: $.PropertyDesc<${line.staticType}, ${
              line.card
            }, ${line.isExclusive.toString()}, ${line.is_computed.toString()}, ${line.is_readonly.toString()}, ${line.hasDefault.toString()}>;`,
          ]);
        }
      }
    });
    body.writeln([t`}>;`]);

    // instantiate ObjectType subtype from shape
    body.writeln([
      dts`declare `,
      t`type ${ref} = $.ObjectType<${quote(type.name)}, ${ref}λShape, null, [`,
    ]);

    const bases = type.bases
      .map((b) => types.get(b.id))
      .map((b) => getRef(b.name));
    body.indented(() => {
      for (const b of bases) {
        body.writeln([t`...${b}['__exclusives__'],`]);
      }
    });

    for (const ex of type.exclusives) {
      body.writeln([
        t`  {`,
        ...Object.keys(ex).map((key) => {
          const target = types.get(ex[key].target_id);
          const { staticType } = getStringRepresentation(target, { types });
          const card = `$.Cardinality.One | $.Cardinality.AtMostOne `;
          return t`${key}: {__element__: ${staticType}, __cardinality__: ${card}},`;
        }),
        t`},`,
      ]);
    }

    body.writeln([
      t`], ${
        [
          ...(!type.is_abstract ? [type.name] : []),
          ...(descendents.get(type.id)?.values() ?? []),
        ]
          .map((typename) => quote(typename))
          .join(" | ") || "never"
      }>;`,
    ]);

    if (type.name === "std::Object") {
      body.writeln([t`export `, dts`declare `, t`type $Object = ${ref}`]);
    }

    /////////
    // generate runtime type
    /////////
    const literal = getRef(type.name, { prefix: "" });

    body.writeln([
      dts`declare `,
      ...frag`const ${ref}`,
      dts`: ${ref}`,
      r` = $.makeType`,
      ts`<${ref}>`,
      r`(_.spec, ${quote(type.id)}, _.syntax.literal);`,
    ]);
    body.addExport(ref);

    const typeCard = singletonObjectTypes.has(type.name) ? "One" : "Many";

    body.nl();
    body.writeln([
      dts`declare `,
      ...frag`const ${literal}`,
      t`: $.$expr_PathNode<$.TypeSet<${ref}, $.Cardinality.${typeCard}>, null> `,
      r`= _.syntax.$PathNode($.$toSet(${ref}, $.Cardinality.${typeCard}), null);`,
    ]);
    body.nl();

    body.addExport(literal);
    body.addToDefaultExport(literal, name);
  }
};

function generatePolyTypenames(types: $.introspect.Types) {
  const descendents = new Map<string, Set<string>>();

  const visit = (current: $.introspect.Type, descendent: $.introspect.Type) => {
    if (current.kind !== "object") {
      return;
    }
    for (const base of current.bases) {
      if (!descendents.has(base.id)) {
        descendents.set(base.id, new Set());
      }
      descendents.get(base.id)!.add(descendent.name);
      visit(types.get(base.id), descendent);
    }
  };
  for (const type of types.values()) {
    if (type.kind === "object" && !type.is_abstract) {
      visit(type, type);
    }
  }
  return descendents;
}
