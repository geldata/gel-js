import type { GeneratorParams } from "../genutil";
import { frag, getRef, quote, splitName } from "../genutil";
import type { CodeBuilder, CodeFragment, DirBuilder } from "../builders";
import { all, CodeBuffer, dts, r, t, ts } from "../builders";

import { getStringRepresentation } from "./generateObjectTypes";
import type { $ } from "../genutil";
import type {
  GroupedParams,
  AnytypeDef,
  FuncopDefOverload,
} from "../funcoputil";
import {
  getTypesSpecificity,
  sortFuncopOverloads,
  getImplicitCastableRootTypes,
  expandFuncopAnytypeOverloads,
  findPathOfAnytype,
} from "../funcoputil";

export const generateFunctionTypes = ({
  dir,
  functions,
  types,
  casts,
}: GeneratorParams) => {
  generateFuncopTypes(
    dir,
    types,
    casts,
    functions,
    "Function",
    "FuncExpr",
    true,
    (code, _funcDef, _args, _namedArgs, returnType) => {
      // Name
      // code.writeln([t`${quote(funcDef.name)},`]);
      // Args
      // code.writeln([t`${args}`]);
      // NamedArgs
      // code.writeln([t`${namedArgs}`]);
      // ReturnType
      code.writeln([t`${returnType}`]);
    },
    (code, funcName) => {
      code.writeln([r`__name__: ${quote(funcName)},`]);
      code.writeln([r`__args__: positionalArgs,`]);
      code.writeln([r`__namedargs__: namedArgs,`]);
    },
  );
};

export function allowsLiterals(
  type: $.introspect.Type,
  anytypes: AnytypeDef | null,
): boolean {
  return (
    (type.name === "anytype" && anytypes?.kind === "noncastable") ||
    type.kind === "scalar"
  );
}

export interface FuncopDef {
  id: string;
  name: string;
  kind?: string;
  description?: string;
  return_type: { id: string; name: string };
  return_typemod: $.introspect.FuncopTypemod;
  params: $.introspect.FuncopParam[];
  preserves_optionality?: boolean;
}

export function generateFuncopTypes<F extends FuncopDef>(
  dir: DirBuilder,
  types: $.introspect.Types,
  casts: $.introspect.Casts,
  funcops: $.StrictMap<string, [F, ...F[]]>,
  funcopExprKind: string,
  typeDefSuffix: string,
  optionalUndefined: boolean,
  typeDefGen: (
    code: CodeBuilder,
    def: F,
    args: CodeFragment[],
    namedArgs: CodeFragment[],
    returnType: CodeFragment[],
  ) => void,
  implReturnGen: (
    code: CodeBuilder,
    funcopName: string,
    funcopDefs: F[],
  ) => void,
) {
  const typeSpecificities = getTypesSpecificity(types, casts);
  const implicitCastableRootTypes = getImplicitCastableRootTypes(casts);

  for (const [funcName, _funcDefs] of funcops.entries()) {
    const { mod, name } = splitName(funcName);

    const code = dir.getModule(mod);

    code.registerRef(funcName, _funcDefs[0].id);
    code.addToDefaultExport(getRef(funcName, { prefix: "" }), name);

    // edgeql stdlib has a constructor function with the same name as the
    // literal constructor and type constuctor for 'range', so replace
    // generated function with implementation from ./syntax
    if (funcName === "std::range") {
      code.writeln([dts`declare `, all`const range = _.syntax.$range;`]);
      code.nl();
      continue;
    }

    const funcDefs = expandFuncopAnytypeOverloads(
      sortFuncopOverloads<F>(_funcDefs, typeSpecificities),
      types,
      casts,
      implicitCastableRootTypes,
    );

    const overloadsBuf = new CodeBuffer();

    let overloadDefIndex = 1;
    for (const funcDef of funcDefs) {
      const { params } = funcDef;

      const hasParams = params.positional.length + params.named.length > 0;

      const namedParamsOverloads =
        !hasParams ||
        params.positional.length === 0 ||
        params.named.some(
          (param) => !(param.typemod === "OptionalType" || param.hasDefault),
        )
          ? [true]
          : params.named.length > 0
            ? [true, false]
            : [false];

      for (const hasNamedParams of namedParamsOverloads) {
        if (funcDef.description) {
          overloadsBuf.writeln([
            t`/**
 * ${funcDef.description.replace(/\*\//g, "")}
 */`,
          ]);
        }

        const functionTypeName = frag`${getRef(funcName, {
          prefix: "",
        })}λ${typeDefSuffix}${
          overloadDefIndex++ > 1 ? String(overloadDefIndex - 1) : ""
        }`;

        const functionTypeSig = frag`${functionTypeName}${
          hasParams
            ? `<${[
                ...(hasNamedParams ? ["NamedArgs"] : []),
                ...params.positional.map((param) => param.typeName),
              ].join(", ")}>`
            : ""
        };`;

        code.writeln([
          dts`declare `,
          t`type ${functionTypeName}${
            hasParams ? `<` : ` = $.$expr_${funcopExprKind}<`
          }`,
        ]);

        overloadsBuf.writeln([
          dts`declare `,
          t`function ${getRef(funcName, { prefix: "" })}${
            hasParams ? "<" : frag`(): ${functionTypeSig}`
          }`,
        ]);

        const anytypes = funcDef.anytypes;
        const anytypeParams: string[] = [];

        function getParamAnytype(
          paramTypeName: string,
          paramType: $.introspect.Type,
          optional: boolean,
        ) {
          if (!anytypes) return undefined;
          if (anytypes.kind === "castable") {
            if (
              paramType.name.includes("anytype") ||
              paramType.name.includes("anypoint")
            ) {
              const path = findPathOfAnytype(paramType.id, types);
              anytypeParams.push(
                optional
                  ? `${paramTypeName} extends $.TypeSet ? ${paramTypeName}${path} : undefined`
                  : `${paramTypeName}${path}`,
              );
            }
            return anytypes.type;
          } else {
            return anytypes.refName === paramTypeName
              ? anytypes.type
              : `$.getPrimitive${
                  anytypes.type[0] === "$.NonArrayType" ? "NonArray" : ""
                }BaseType<${
                  allowsLiterals(anytypes.typeObj, anytypes)
                    ? `_.castMaps.literalToTypeSet<${anytypes.refName}>`
                    : anytypes.refName
                }${anytypes.refPath}>`;
          }
        }

        let hasNamedLiterals = false;
        let hasPositionalLiterals = false;

        if (hasParams) {
          // param types
          code.indented(() => {
            overloadsBuf.indented(() => {
              // named params
              if (hasNamedParams) {
                code.writeln([t`NamedArgs extends {`]);
                overloadsBuf.writeln([t`NamedArgs extends {`]);

                code.indented(() => {
                  overloadsBuf.indented(() => {
                    for (const param of params.named) {
                      const anytype = getParamAnytype(
                        param.typeName,
                        param.type,
                        param.typemod === "OptionalType" || !!param.hasDefault,
                      );

                      const paramType = getStringRepresentation(param.type, {
                        types,
                        anytype,
                        casts: casts.implicitCastFromMap,
                      });
                      let typeStr = frag`$.TypeSet<${paramType.staticType}>`;
                      if (allowsLiterals(param.type, anytypes)) {
                        typeStr = frag`_.castMaps.orScalarLiteral<${typeStr}>`;
                        hasNamedLiterals = true;
                      }
                      const line = t`${quote(param.name)}${
                        param.typemod === "OptionalType" || param.hasDefault
                          ? "?"
                          : ""
                      }: ${typeStr},`;

                      code.writeln([line]);
                      overloadsBuf.writeln([line]);
                    }
                  });
                });
                code.writeln([t`},`]);
                overloadsBuf.writeln([t`},`]);
              }

              // positional + variadic params
              for (const param of params.positional) {
                const anytype = getParamAnytype(
                  param.typeName,
                  param.type,
                  optionalUndefined &&
                    (param.typemod === "OptionalType" || !!param.hasDefault),
                );

                const paramTypeStr = getStringRepresentation(param.type, {
                  types,
                  anytype,
                  casts: casts.implicitCastFromMap,
                });

                let type = frag`$.TypeSet<${paramTypeStr.staticType}>`;

                if (allowsLiterals(param.type, anytypes)) {
                  type = frag`_.castMaps.orScalarLiteral<${type}>`;
                  hasPositionalLiterals = true;
                }

                const line = t`${param.typeName} extends ${
                  param.kind === "VariadicParam"
                    ? frag`[${type}, ...${type}[]]`
                    : type
                }${
                  optionalUndefined &&
                  (param.typemod === "OptionalType" || param.hasDefault)
                    ? " | undefined"
                    : ""
                },`;

                code.writeln([line]);
                overloadsBuf.writeln([line]);
              }
            });
          });

          code.writeln([t`> = $.$expr_${funcopExprKind}<`]);
          overloadsBuf.writeln([t`>(`]);

          // args signature
          overloadsBuf.indented(() => {
            if (hasNamedParams) {
              overloadsBuf.writeln([t`namedArgs: NamedArgs,`]);
            }

            for (const param of params.positional) {
              overloadsBuf.writeln([
                t`${param.kind === "VariadicParam" ? "..." : ""}${
                  param.internalName
                }${
                  optionalUndefined &&
                  (param.typemod === "OptionalType" || param.hasDefault)
                    ? "?"
                    : ""
                }: ${param.typeName}${
                  param.kind === "VariadicParam" ? "" : ","
                }`,
              ]);
            }
          });

          overloadsBuf.writeln([t`): ${functionTypeSig}`]);
        }

        code.indented(() => {
          const returnAnytype = anytypes
            ? anytypes.kind === "castable"
              ? anytypeParams.length <= 1
                ? anytypeParams[0]
                : anytypeParams.slice(1).reduce((parent, type) => {
                    return `${anytypes.returnAnytypeWrapper}<${parent}, ${type}>`;
                  }, anytypeParams[0])
              : `$.getPrimitive${
                  anytypes.type[0] === "$.NonArrayType" ? "NonArray" : ""
                }BaseType<${
                  allowsLiterals(anytypes.typeObj, anytypes)
                    ? `_.castMaps.literalToTypeSet<${anytypes.refName}>`
                    : anytypes.refName
                }${anytypes.refPath}>`
            : undefined;
          const returnType = getStringRepresentation(
            types.get(funcDef.return_type.id),
            {
              types,
              anytype: returnAnytype,
            },
          );

          const positionalParams = params.positional
            .map(
              (param) =>
                `${param.kind === "VariadicParam" ? "..." : ""}${
                  param.typeName
                }`,
            )
            .join(", ");

          typeDefGen(
            code,
            funcDef,
            // args
            hasPositionalLiterals
              ? frag`_.castMaps.mapLiteralToTypeSet<[${positionalParams}]>,`
              : frag`[${positionalParams}],`,
            // named args
            frag`${
              hasParams && hasNamedParams
                ? hasNamedLiterals
                  ? "_.castMaps.mapLiteralToTypeSet<NamedArgs>"
                  : "NamedArgs"
                : "{}"
            },`,
            // return type
            frag`${returnType.staticType}, ${generateReturnCardinality(
              funcName,
              parametersToFunctionCardinality(params, hasNamedParams),
              funcDef.return_typemod,
              funcDef.preserves_optionality,
            )}`,
          );
        });

        code.writeln([t`>;`]);
      }
    }

    code.writeBuf(overloadsBuf);

    // implementation
    code.writeln([
      r`function ${getRef(funcName, { prefix: "" })}(...args`,
      ts`: any[]`,
      r`) {`,
    ]);

    code.indented(() => {
      code.writeln([
        r`const {${
          funcDefs[0]?.kind ? "kind, " : ""
        }returnType, cardinality, args: positionalArgs, namedArgs} = _.syntax.$resolveOverload('${funcName}', args, _.spec, [`,
      ]);
      code.indented(() => {
        let overloadIndex = 0;
        for (const funcDef of funcDefs) {
          if (funcDef.overloadIndex !== overloadIndex) {
            continue;
          }
          overloadIndex++;

          code.writeln([r`${generateFuncopDef(funcDef)},`]);
        }
      });
      code.writeln([r`]);`]);

      code.writeln([r`return _.syntax.$expressionify({`]);
      code.indented(() => {
        code.writeln([r`__kind__: $.ExpressionKind.${funcopExprKind},`]);
        code.writeln([r`__element__: returnType,`]);
        code.writeln([r`__cardinality__: cardinality,`]);
        implReturnGen(code, funcName, funcDefs);
      });
      code.writeln([r`})`, ts` as any`, r`;`]);
    });

    code.writeln([r`};`]);

    code.nl();
  }
}

export function generateFuncopDef(funcopDef: FuncopDefOverload<FuncopDef>) {
  const { params } = funcopDef;

  function getArgSpec(param: GroupedParams["named" | "positional"][number]) {
    return `{typeId: ${quote(param.type.id)}, optional: ${(
      param.typemod === "OptionalType" || !!param.hasDefault
    ).toString()}, setoftype: ${(
      param.typemod === "SetOfType"
    ).toString()}, variadic: ${(param.kind === "VariadicParam").toString()}}`;
  }

  const argsDef = params.positional.map((param) => {
    return getArgSpec(param);
  });
  const namedArgsDef = params.named.length
    ? `namedArgs: {${params.named
        .map((param) => {
          return `${quote(param.name)}: ${getArgSpec(param)}`;
        })
        .join(", ")}}, `
    : "";

  return `{${
    funcopDef.kind ? `kind: ${quote(funcopDef.kind)}, ` : ""
  }args: [${argsDef.join(", ")}], ${namedArgsDef}returnTypeId: ${quote(
    funcopDef.return_type.id,
  )}${
    funcopDef.return_typemod === "SingletonType"
      ? ""
      : `, returnTypemod: ${quote(funcopDef.return_typemod)}`
  }${funcopDef.preserves_optionality ? `, preservesOptionality: true` : ""}}`;
}

type ParamCardinality =
  | { type: "ONE" }
  | { type: "OVERRIDE_UPPER"; with: "One"; param: ParamCardinality }
  | { type: "OPTIONAL"; param: string }
  | { type: "VARIADIC"; param: string }
  | { type: "PARAM"; param: string }
  | { type: "IDENTITY"; param: string };

type ReturnCardinality =
  | { type: "MANY" }
  | { type: "ONE" }
  | { type: "ZERO" }
  | {
      type: "MERGE";
      params: [ParamCardinality, ParamCardinality];
    }
  | {
      type: "COALESCE";
      params: [ParamCardinality, ParamCardinality];
    }
  | {
      type: "IF_ELSE";
      condition: ParamCardinality;
      trueBranch: ParamCardinality;
      falseBranch: ParamCardinality;
    }
  | { type: "OVERRIDE_LOWER"; with: "One" | "Zero"; param: ReturnCardinality }
  | { type: "OVERRIDE_UPPER"; with: "One"; param: ParamCardinality }
  | { type: "MULTIPLY"; params: ParamCardinality[] }
  | { type: "IDENTITY"; param: ParamCardinality };

export interface FuncopParamNamed extends $.introspect.FuncopParam {
  genTypeName: string;
}

export function getReturnCardinality(
  name: string,
  params: FuncopParamNamed[],
  returnTypemod: $.introspect.FuncopTypemod,
  preservesOptionality = false,
): ReturnCardinality {
  if (
    returnTypemod === "SetOfType" &&
    name !== "std::if_else" &&
    name !== "std::assert_exists" &&
    name !== "std::union" &&
    name !== "std::coalesce" &&
    name !== "std::distinct"
  ) {
    return { type: "MANY" };
  }

  if (name === "std::union") {
    return {
      type: "MERGE",
      params: [
        { type: "PARAM", param: params[0]!.genTypeName },
        { type: "PARAM", param: params[1]!.genTypeName },
      ],
    };
  }

  if (name === "std::coalesce") {
    return {
      type: "COALESCE",
      params: [
        { type: "PARAM", param: params[0]!.genTypeName },
        { type: "PARAM", param: params[1]!.genTypeName },
      ],
    };
  }

  if (name === "std::distinct") {
    return {
      type: "IDENTITY",
      param: { type: "PARAM", param: params[0]!.genTypeName },
    };
  }

  if (name === "std::if_else") {
    return {
      type: "IF_ELSE",
      condition: { type: "PARAM", param: params[1]!.genTypeName },
      trueBranch: { type: "PARAM", param: params[0]!.genTypeName },
      falseBranch: { type: "PARAM", param: params[2]!.genTypeName },
    };
  }

  if (name === "std::assert_exists") {
    return {
      type: "OVERRIDE_LOWER",
      with: "One",
      param: {
        type: "IDENTITY",
        param: { type: "PARAM", param: params[0]!.genTypeName },
      },
    };
  }

  const paramCardinalities: ParamCardinality[] = params.map(
    (param): ParamCardinality => {
      if (param.typemod === "SetOfType") {
        if (preservesOptionality) {
          return {
            type: "OVERRIDE_UPPER",
            with: "One",
            param: { type: "PARAM", param: param.genTypeName },
          };
        } else {
          return {
            type: "ONE",
          };
        }
      }

      const type =
        param.typemod === "OptionalType" || param.hasDefault
          ? "OPTIONAL"
          : param.kind === "VariadicParam"
            ? "VARIADIC"
            : "PARAM";

      return { type, param: param.genTypeName };
    },
  );

  const cardinality: ReturnCardinality = paramCardinalities.length
    ? paramCardinalities.length > 1
      ? { type: "MULTIPLY", params: paramCardinalities }
      : { type: "IDENTITY", param: paramCardinalities[0]! }
    : { type: "ONE" };

  return returnTypemod === "OptionalType" && !preservesOptionality
    ? { type: "OVERRIDE_LOWER", with: "Zero", param: cardinality }
    : cardinality;
}

function renderParamCardinality(card: ParamCardinality): string {
  switch (card.type) {
    case "ONE": {
      return `$.Cardinality.One`;
    }
    case "OVERRIDE_UPPER": {
      return `$.cardutil.overrideUpperBound<${renderParamCardinality(card.param)}, "One">`;
    }
    case "OPTIONAL": {
      return `$.cardutil.optionalParamCardinality<${card.param}>`;
    }
    case "VARIADIC": {
      return `$.cardutil.paramArrayCardinality<${card.param}>`;
    }
    case "PARAM": {
      return `$.cardutil.paramCardinality<${card.param}>`;
    }
    case "IDENTITY": {
      return card.param;
    }
    default: {
      throw new Error(`Unknown param cardinality type: ${(card as any).type}`);
    }
  }
}

function renderCardinality(card: ReturnCardinality): string {
  switch (card.type) {
    case "MANY": {
      return `$.Cardinality.Many`;
    }
    case "ONE": {
      return `$.Cardinality.One`;
    }
    case "ZERO": {
      return `$.Cardinality.Zero`;
    }
    case "MERGE": {
      const [LHS, RHS] = card.params.map(renderParamCardinality);
      return `$.cardutil.mergeCardinalities<${LHS}, ${RHS}>`;
    }
    case "COALESCE": {
      const [LHS, RHS] = card.params.map(renderParamCardinality);
      return `$.cardutil.coalesceCardinalities<${LHS}, ${RHS}>`;
    }
    case "IDENTITY": {
      return renderParamCardinality(card.param);
    }
    case "IF_ELSE": {
      return `$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<${renderParamCardinality(card.trueBranch)}, ${renderParamCardinality(card.falseBranch)}>, ${renderParamCardinality(card.condition)}>`;
    }
    case "OVERRIDE_LOWER": {
      return `$.cardutil.overrideLowerBound<${renderCardinality(card.param)}, "${card.with}">`;
    }
    case "OVERRIDE_UPPER": {
      return `$.cardutil.overrideUpperBound<${renderParamCardinality(card.param)}, "One">`;
    }
    case "MULTIPLY": {
      return card.params
        .slice(1)
        .reduce(
          (cards, card) =>
            `$.cardutil.multiplyCardinalities<${cards}, ${renderParamCardinality(card)}>`,
          renderParamCardinality(card.params[0]!),
        );
    }
    default: {
      throw new Error(`Unknown return cardinality type: ${(card as any).type}`);
    }
  }
}

function parametersToFunctionCardinality(
  params: GroupedParams,
  hasNamedParams: boolean,
): ($.introspect.FuncopParam & { genTypeName: string })[] {
  return [
    ...params.positional.map((p) => ({
      ...p,
      genTypeName: p.typeName,
    })),
    ...(hasNamedParams
      ? params.named.map((p) => ({
          ...p,
          genTypeName: `NamedArgs[${quote(p.name)}]`,
        }))
      : []),
  ];
}

/**
 * Derives the return cardinality from the input parameters, return type-mod,
 * and function flags:
 * - Default: Cartesian product of parameter actual cardinalities (or overridden
 *   cardinality)
 * - Parameter type-mods override actual parameter cardinality:
 *   - SetOfType: One (unless preservesOptionality, then override upper
 *     cardinality to One)
 *   - Optional or HasDefault: Override lower cardinality of actual to One
 * - Return type-mod:
 *   - Optional: Override return lower cardinality to Zero (product with
 *     AtMostOne), ignored if preservesOptionality
 *   - SetOfType: Always Many
 */
export function generateReturnCardinality(
  name: string,
  params: FuncopParamNamed[],
  returnTypemod: $.introspect.FuncopTypemod,
  preservesOptionality = false,
): string {
  const returnCard = getReturnCardinality(
    name,
    params,
    returnTypemod,
    preservesOptionality,
  );
  return renderCardinality(returnCard);
}
