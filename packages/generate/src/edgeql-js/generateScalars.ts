import {
  splitName,
  getRef,
  frag,
  joinFrags,
  quote,
  toTSScalarType,
  scalarToLiteralMapping,
} from "../genutil";
import { dts, r, t, ts } from "../builders";
import type { GeneratorParams } from "../genutil";
import { $ } from "../genutil";

export const generateScalars = (params: GeneratorParams) => {
  const { dir, types, casts, scalars } = params;
  for (const type of types.values()) {
    if (type.kind !== "scalar") {
      continue;
    }

    const { mod, name: _name } = splitName(type.name);

    const sc = dir.getModule(mod);

    sc.registerRef(type.name, type.id);

    const ref = getRef(type.name);
    const literal = getRef(type.name, { prefix: "" });

    if (type.name === "std::anyenum") {
      //       sc.writeln(frag`
      // const ANYENUM_SYMBOL: unique symbol = Symbol("std::anyenum");
      // export interface ${ref}<
      //   TsType = unknown,
      //   Name extends string = string,
      //   Values extends [string, ...string[]] = [string, ...string[]]
      // > extends $.ScalarType<Name, TsType> {
      //   [ANYENUM_SYMBOL]: true;
      //   __values__: Values;
      // }`);
      //       sc.nl();
      continue;
    }

    if (type.is_abstract) {
      const scalarType = scalars.get(type.id);

      if (scalarType.children.length) {
        // is abstract
        const children = [
          ...new Set(
            scalarType.children.map(
              (desc) => ($.introspect.typeMapping.get(desc.id) ?? desc).name,
            ),
          ),
        ].map((descName) =>
          descName === "std::anyenum" ? "$.EnumType" : getRef(descName),
        );
        sc.writeln([
          dts`declare `,
          t`type ${ref} = ${joinFrags(children, " | ")};`,
        ]);
        sc.nl();

        sc.addExport(ref, { typeOnly: true });
        // sc.addExport(ref, `$${_name}`); // dollar
      } else if (scalarType.bases.length) {
        // for std::sequence1
        const bases = scalarType.bases.map((base) => getRef(base.name));
        sc.writeln([t`interface ${ref} extends ${joinFrags(bases, ", ")} {}`]);
        sc.writeln([
          dts`declare `,
          ...frag`const ${ref}`,
          t`: ${ref}`,
          r` = $.makeType`,
          ts`<${ref}>`,
          r`(_.spec, "${type.id}", _.syntax.literal);`,
        ]);
        sc.nl();

        sc.addExport(ref);
        // sc.addExport(ref, `$${_name}`); // dollar
      }

      continue;
    }

    // generate enum
    if (type.enum_values && type.enum_values.length) {
      sc.writeln([
        t`export `,
        dts`declare `,
        t`type ${ref} = {\n`,
        ...type.enum_values.map(
          (val) => t`  ${quote(val)}: $.$expr_Literal<${ref}>;\n`,
        ),
        t`} & `,
        t`$.EnumType<${quote(type.name)}, [${type.enum_values
          .map((val) => quote(val))
          .join(", ")}]>;`,
      ]);
      sc.writeln([
        dts`declare `,
        ...frag`const ${literal}`,
        t`: ${ref}`,
        r` = $.makeType`,
        ts`<${ref}>`,
        r`(_.spec, "${type.id}", _.syntax.literal);`,
      ]);

      sc.nl();
      sc.addExport(literal);
      sc.addToDefaultExport(literal, _name);
      continue;
    }

    // generate non-enum non-abstract scalar
    const tsType = toTSScalarType(type, types);
    // const tsType = toTSScalarType(type, types);
    // const extraTypes = scalarToLiteralMapping[type.name]?.extraTypes;
    // const extraTypesUnion = extraTypes ? `, ${extraTypes.join(" | ")}` : "";

    if (type.cast_type) {
      const mapped = types.get(type.cast_type);
      const mappedRef = getRef(mapped.name);

      const extraTypes = (
        scalarToLiteralMapping[mapped.name]?.extraTypes || ["never"]
      ).join(" | ");
      const argTypes = (
        scalarToLiteralMapping[mapped.name]?.argTypes ?? []
      ).join(" | ");
      // const extraTypesUnion = extraTypes ?
      //   `, ${extraTypes.join(" | ")}` : "";
      // sc.writeln([
      //   t`export `,
      //   dts`declare `,
      //   t`type ${ref} = $.CastOnlyScalarType<"${
      //     mapped.name}", ${mappedRef}>;`,
      // ]);
      sc.writeln([
        t`export `,
        dts`declare `,
        t`type ${ref} = $.ScalarType<"${mapped.name}", ${tsType}${
          argTypes ? `, ${tsType} | ${argTypes}` : ""
        }>;`,
      ]);

      // sc.writeln([
      //   dts`declare `,
      //   ...frag`const ${literal}`,
      //   t`: ${mappedRef}`,
      //   r` = $.makeType`,
      //   ts`<${mappedRef}>`,
      //   r`(_.spec, "${mapped.id}", _.syntax.literal);`,
      // ]);
      sc.writeln([
        dts`declare `,
        ...frag`const ${literal}`,
        t`: $.scalarTypeWithConstructor<${mappedRef}, ${extraTypes}>`,
        r` = $.makeType`,
        ts`<$.scalarTypeWithConstructor<${mappedRef}, ${extraTypes}>>`,
        r`(_.spec, "${type.id}", _.syntax.literal);`,
      ]);
    } else {
      const extraTypes = (
        scalarToLiteralMapping[type.name]?.extraTypes || ["never"]
      ).join(" | ");
      const argTypes = (scalarToLiteralMapping[type.name]?.argTypes ?? []).join(
        " | ",
      );
      // const extraTypesUnion = extraTypes ?
      //   `, ${extraTypes.join(" | ")}` : "";
      sc.writeln([
        t`export `,
        dts`declare `,
        t`type ${ref} = $.ScalarType<"${type.name}", ${tsType}${
          argTypes ? `, ${tsType} | ${argTypes}` : ""
        }>;`,
      ]);

      sc.writeln([
        dts`declare `,
        ...frag`const ${literal}`,
        t`: $.scalarTypeWithConstructor<${ref}, ${extraTypes}>`,
        r` = $.makeType`,
        ts`<$.scalarTypeWithConstructor<${ref}, ${extraTypes}>>`,
        r`(_.spec, "${type.id}", _.syntax.literal);`,
      ]);
    }

    if (casts.implicitCastFromMap[type.id]?.length) {
      sc.writeln([
        t`export `,
        dts`declare `,
        t`type ${ref}λICastableTo = ${joinFrags(
          [
            ref,
            ...casts.implicitCastFromMap[type.id]!.map((typeId) =>
              getRef(types.get(typeId).name),
            ),
          ],
          " | ",
        )};`,
      ]);
    }

    const assignableMap = casts.assignableByMap[type.id] || [];
    if (casts.assignableByMap[type.id]?.length) {
      sc.writeln([
        t`export `,
        dts`declare `,
        t`type ${ref}λIAssignableBy = ${joinFrags(
          assignableMap.length
            ? [
                ref,
                ...assignableMap.map((typeId) =>
                  getRef(types.get(typeId).name),
                ),
              ]
            : [ref],
          " | ",
        )};`,
      ]);
    }

    sc.addExport(literal);
    if (_name !== "number") sc.addToDefaultExport(literal, _name);

    sc.nl();
  }
};
