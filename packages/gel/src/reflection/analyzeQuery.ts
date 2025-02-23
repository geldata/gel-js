import { ArrayCodec } from "../codecs/array";
import { EnumCodec } from "../codecs/enum";
import type { ICodec } from "../codecs/ifaces";
import { ScalarCodec } from "../codecs/ifaces";
import { NamedTupleCodec } from "../codecs/namedtuple";
import { ObjectCodec } from "../codecs/object";
import { MultiRangeCodec, RangeCodec } from "../codecs/range";
import { NullCodec } from "../codecs/codecs";
import { SetCodec } from "../codecs/set";
import { TupleCodec } from "../codecs/tuple";
import type { Client } from "../baseClient";
import { Cardinality } from "./enums";
import { util } from "./util";

type QueryType = {
  args: string;
  result: string;
  cardinality: Cardinality;
  query: string;
  importMap: ImportMap;
  /** @deprecated */
  imports: Set<string>;
};

export async function analyzeQuery(
  client: Client,
  query: string,
): Promise<QueryType> {
  const { cardinality, in: inCodec, out: outCodec } = await client.parse(query);

  const args = generateTSTypeFromCodec(inCodec, Cardinality.One, {
    optionalNulls: true,
    readonly: true,
  });
  const result = generateTSTypeFromCodec(outCodec, cardinality);

  const imports = args.imports.merge(result.imports);
  return {
    result: result.type,
    args: args.type,
    cardinality,
    query,
    importMap: imports,
    imports: imports.get("gel") ?? new Set(),
  };
}

type AbstractClass<T> = (abstract new (...arguments_: any[]) => T) & {
  prototype: T;
};

type CodecLike = ICodec | ScalarCodec;

export type CodecGenerator<Codec extends CodecLike = CodecLike> = (
  codec: Codec,
  context: CodecGeneratorContext,
) => string;

type CodecGeneratorMap = ReadonlyMap<AbstractClass<CodecLike>, CodecGenerator>;

export type CodecGeneratorContext = {
  indent: string;
  optionalNulls: boolean;
  readonly: boolean;
  imports: ImportMap;
  walk: (codec: CodecLike, context?: CodecGeneratorContext) => string;
  generators: CodecGeneratorMap;
  applyCardinality: (type: string, cardinality: Cardinality) => string;
};

export type CodecGenerationOptions = Partial<
  Pick<
    CodecGeneratorContext,
    "optionalNulls" | "readonly" | "generators" | "applyCardinality"
  >
>;

export const generateTSTypeFromCodec = (
  codec: ICodec,
  cardinality: Cardinality = Cardinality.One,
  options: CodecGenerationOptions = {},
) => {
  const optionsWithDefaults = {
    indent: "",
    optionalNulls: false,
    readonly: false,
    ...options,
  };
  const context: CodecGeneratorContext = {
    ...optionsWithDefaults,
    generators: defaultCodecGenerators,
    applyCardinality: defaultApplyCardinalityToTsType(optionsWithDefaults),
    ...options,
    imports: new ImportMap(),
    walk: (codec, innerContext) => {
      innerContext ??= context;
      for (const [type, generator] of innerContext.generators) {
        if (codec instanceof type) {
          return generator(codec, innerContext);
        }
      }
      throw new Error(`Unexpected codec kind: ${codec.getKind()}`);
    },
  };
  const type = context.applyCardinality(
    context.walk(codec, context),
    cardinality,
  );
  return {
    type,
    imports: context.imports,
  };
};

/** A helper function to define a codec generator tuple. */
const genDef = <Codec extends CodecLike>(
  codecType: AbstractClass<Codec>,
  generator: CodecGenerator<Codec>,
) =>
  [codecType as AbstractClass<CodecLike>, generator as CodecGenerator] as const;
export { genDef as defineCodecGeneratorTuple };

export const defaultCodecGenerators: CodecGeneratorMap = new Map([
  genDef(NullCodec, () => "null"),
  genDef(EnumCodec, (codec) => {
    return `(${codec.values.map((val) => JSON.stringify(val)).join(" | ")})`;
  }),
  genDef(ScalarCodec, (codec, ctx) => {
    if (codec.tsModule) {
      ctx.imports.add(codec.tsModule, codec.tsType);
    }
    return codec.tsType;
  }),
  genDef(ObjectCodec, (codec, ctx) => {
    const subCodecs = codec.getSubcodecs();
    const fields = codec.getFields().map((field, i) => ({
      name: field.name,
      codec: subCodecs[i],
      cardinality: util.parseCardinality(field.cardinality),
    }));
    return generateTsObject(fields, ctx);
  }),
  genDef(NamedTupleCodec, (codec, ctx) => {
    const subCodecs = codec.getSubcodecs();
    const fields = codec.getNames().map((name, i) => ({
      name,
      codec: subCodecs[i],
      cardinality: Cardinality.One,
    }));
    return generateTsObject(fields, ctx);
  }),
  genDef(TupleCodec, (codec, ctx) => {
    const subCodecs = codec
      .getSubcodecs()
      .map((subCodec) => ctx.walk(subCodec));
    const tuple = `[${subCodecs.join(", ")}]`;
    return ctx.readonly ? `(readonly ${tuple})` : tuple;
  }),
  genDef(ArrayCodec, (codec, ctx) =>
    ctx.applyCardinality(ctx.walk(codec.getSubcodecs()[0]), Cardinality.Many),
  ),
  genDef(RangeCodec, (codec, ctx) => {
    const subCodec = codec.getSubcodecs()[0];
    if (!(subCodec instanceof ScalarCodec)) {
      throw Error("expected range subtype to be scalar type");
    }
    ctx.imports.add(codec.tsModule, codec.tsType);
    return `${codec.tsType}<${ctx.walk(subCodec)}>`;
  }),
  genDef(MultiRangeCodec, (codec, ctx) => {
    const subCodec = codec.getSubcodecs()[0];
    if (!(subCodec instanceof ScalarCodec)) {
      throw Error("expected multirange subtype to be scalar type");
    }
    ctx.imports.add(codec.tsModule, codec.tsType);
    return `${codec.tsType}<${ctx.walk(subCodec)}>`;
  }),
]);

export const generateTsObject = (
  fields: Parameters<typeof generateTsObjectField>[0][],
  ctx: CodecGeneratorContext,
) => {
  const properties = fields.map((field) => generateTsObjectField(field, ctx));
  return `{\n${properties.join("\n")}\n${ctx.indent}}`;
};

export const generateTsObjectField = (
  field: { name: string; cardinality: Cardinality; codec: ICodec },
  ctx: CodecGeneratorContext,
) => {
  const codec = unwrapSetCodec(field.codec, field.cardinality);

  const name = JSON.stringify(field.name);
  const value = ctx.applyCardinality(
    ctx.walk(codec, { ...ctx, indent: ctx.indent + "  " }),
    field.cardinality,
  );
  const optional =
    ctx.optionalNulls && field.cardinality === Cardinality.AtMostOne;
  const questionMark = optional ? "?" : "";
  const isReadonly = ctx.readonly ? "readonly " : "";
  return `${ctx.indent}  ${isReadonly}${name}${questionMark}: ${value};`;
};

function unwrapSetCodec(codec: ICodec, cardinality: Cardinality) {
  if (!(codec instanceof SetCodec)) {
    return codec;
  }
  if (
    cardinality === Cardinality.Many ||
    cardinality === Cardinality.AtLeastOne
  ) {
    return codec.getSubcodecs()[0];
  }
  throw new Error("Sub-codec is SetCodec, but upper cardinality is one");
}

export const defaultApplyCardinalityToTsType =
  (ctx: Pick<CodecGeneratorContext, "readonly">) =>
  (type: string, cardinality: Cardinality): string => {
    switch (cardinality) {
      case Cardinality.Many:
        return `${ctx.readonly ? "Readonly" : ""}Array<${type}>`;
      case Cardinality.One:
        return type;
      case Cardinality.AtMostOne:
        return `${type} | null`;
      case Cardinality.AtLeastOne: {
        const tuple = `[(${type}), ...(${type})[]]`;
        return ctx.readonly ? `(readonly ${tuple})` : tuple;
      }
    }
    throw new Error(`Unexpected cardinality: ${cardinality}`);
  };

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
