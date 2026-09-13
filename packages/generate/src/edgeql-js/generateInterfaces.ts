import { CodeBuffer, t } from "../builders";
import type { GeneratorParams } from "../genutil";
import { $ } from "../genutil";
import { makePlainIdent, quote, splitName, toTSScalarType } from "../genutil";

export type GenerateInterfacesParams = Pick<GeneratorParams, "dir" | "types">;

interface ModuleData {
  name: string;
  internalName: string;
  fullInternalName: string;
  buf: CodeBuffer;
  types: Map<string, string>;
  isRoot: boolean;
  nestedModules: Map<string, ModuleData>;
}

export const generateInterfaces = (params: GenerateInterfacesParams) => {
  const { dir, types } = params;

  const plainTypesCode = dir.getPath("interfaces");
  plainTypesCode.addImportStar("gel", "gel", {
    typeOnly: true,
  });
  const plainTypeModules = new Map<string, ModuleData>();

  const getModule = (mod: string): ModuleData => {
    let module = plainTypeModules.get(mod);

    if (!module) {
      const modParts = mod.split("::");
      const modName = modParts.at(-1)!;
      const parentModName = modParts.slice(0, -1).join("::");
      const parent = parentModName ? getModule(parentModName) : null;
      const internalName = makePlainIdent(modName);

      module = {
        name: modName,
        internalName,
        fullInternalName:
          (parent?.fullInternalName ? parent.fullInternalName + "." : "") +
          internalName,
        buf: new CodeBuffer(),
        types: new Map(),
        isRoot: !parentModName,
        nestedModules: new Map(),
      };
      plainTypeModules.set(mod, module);

      if (parent) {
        parent.nestedModules.set(modName, module);
      }
    }

    return module;
  };

  const getPlainTypeModule = (
    typeName: string,
  ): {
    tMod: string;
    tName: string;
    module: ModuleData;
  } => {
    const { mod: tMod, name: tName } = splitName(typeName);

    return { tMod, tName, module: getModule(tMod) };
  };

  const _getTypeName =
    (mod: string) =>
    (typeName: string, withModule = false): string => {
      const { tMod, tName, module } = getPlainTypeModule(typeName);
      return (
        (mod !== tMod || withModule ? `${module.fullInternalName}.` : "") +
        `${makePlainIdent(tName)}`
      );
    };

  for (const type of types.values()) {
    if (type.kind === "scalar" && type.enum_values?.length) {
      // generate plain enum type
      const { mod: enumMod, name: enumName } = splitName(type.name);
      const getEnumTypeName = _getTypeName(enumMod);

      const { module } = getPlainTypeModule(type.name);
      module.types.set(enumName, getEnumTypeName(type.name, true));
      module.buf.writeln([
        t`export type ${getEnumTypeName(type.name)} = ${type.enum_values
          .map((val) => quote(val))
          .join(" | ")};`,
      ]);
    }
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

    /////////
    // generate plain type
    /////////

    const getTypeName = _getTypeName(mod);

    const getTSType = (pointer: $.introspect.Pointer): string => {
      const targetType = types.get(pointer.target_id);
      const isLink = pointer.kind === "link";
      const isUnion =
        isLink &&
        targetType.kind === "object" &&
        Boolean(targetType.union_of?.length);

      if (isUnion) {
        return `(${targetType.union_of
          .map(({ id }) => types.get(id))
          .map((member) => getTypeName(member.name))
          .join(" | ")})`;
      } else if (isLink) {
        return getTypeName(targetType.name);
      } else {
        return toTSScalarType(targetType as $.introspect.PrimitiveType, types, {
          getEnumRef: (enumType) => getTypeName(enumType.name),
          gelDatatypePrefix: "",
        }).join("");
      }
    };

    const { module: plainTypeModule } = getPlainTypeModule(type.name);
    const pointers = type.pointers.filter((ptr) => ptr.name !== "__type__");

    plainTypeModule.types.set(name, getTypeName(type.name, true));

    plainTypeModule.buf.writeln([
      t`export interface ${getTypeName(type.name)}${
        type.bases.length
          ? ` extends ${type.bases
              .map(({ id }) => {
                const baseType = types.get(id);
                return getTypeName(baseType.name);
              })
              .join(", ")}`
          : ""
      } ${
        pointers.length
          ? `{\n${pointers
              .map((pointer) => {
                const isOptional = pointer.card === $.Cardinality.AtMostOne;
                return `  ${quote(pointer.name)}${
                  isOptional ? "?" : ""
                }: ${getTSType(pointer)}${
                  pointer.card === $.Cardinality.Many ||
                  pointer.card === $.Cardinality.AtLeastOne
                    ? "[]"
                    : ""
                }${isOptional ? " | null" : ""};`;
              })
              .join("\n")}\n}`
          : "{}"
      }\n`,
    ]);
  }

  // plain types export
  const plainTypesExportBuf = new CodeBuffer();

  const writeModuleExports = (module: ModuleData) => {
    plainTypesCode.writeln([t`export namespace ${module.internalName} {`]);
    plainTypesCode.increaseIndent();

    plainTypesCode.writeBuf(module.buf);

    plainTypesExportBuf.writeln([t`${quote(module.name)}: {`]);
    plainTypesExportBuf.increaseIndent();
    for (const [name, typeName] of module.types) {
      plainTypesExportBuf.writeln([t`${quote(name)}: ${typeName};`]);
    }

    for (const nestedMod of module.nestedModules.values()) {
      writeModuleExports(nestedMod);
    }

    plainTypesExportBuf.decreaseIndent();
    plainTypesExportBuf.writeln([t`};`]);

    plainTypesCode.decreaseIndent();
    plainTypesCode.writeln([t`}`]);
    plainTypesCode.addExport(module.internalName, { modes: ["js"] });

    if (module.isRoot && module.name === "default") {
      const sliceTo = module.internalName.length + 1;
      for (const typeRef of module.types.values()) {
        const aliased = typeRef.slice(sliceTo);
        plainTypesCode.writeln([`export type ${aliased} = ${typeRef};\n`]);
      }

      for (const nestedMod of module.nestedModules.values()) {
        plainTypesCode.writeln([
          `export namespace ${nestedMod.internalName} {`,
        ]);
        plainTypesCode.increaseIndent();
        for (const typeRef of nestedMod.types.values()) {
          const aliased = typeRef.slice(
            sliceTo + nestedMod.internalName.length + 1,
          );
          plainTypesCode.writeln([`export type ${aliased} = ${typeRef};`]);
        }
        plainTypesCode.decreaseIndent();
        plainTypesCode.writeln([`}`]);
      }
    }
  };

  for (const module of [...plainTypeModules.values()].filter(
    (mod) => mod.isRoot,
  )) {
    writeModuleExports(module);
  }

  plainTypesCode.writeln([t`export interface types {`]);
  plainTypesCode.indented(() => plainTypesCode.writeBuf(plainTypesExportBuf));
  plainTypesCode.writeln([t`}`]);

  plainTypesCode.writeln([
    t`

export namespace helper {
  type LinkType = std.BaseObject | std.BaseObject[];

  export type propertyKeys<T> = {
    [k in keyof T]: NonNullable<T[k]> extends LinkType ? never : k;
  }[keyof T];

  export type linkKeys<T> = {
    [k in keyof T]: NonNullable<T[k]> extends LinkType ? k : never;
  }[keyof T];

  export type Props<T> = Pick<T, propertyKeys<T>>;
  export type Links<T> = Pick<T, linkKeys<T>>;
}
`,
  ]);
};
