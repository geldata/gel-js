import { debug } from "debug";

import { CodeBuffer, type CodeFragment, r, t, ts } from "../builders";
import type { GeneratorParams } from "../genutil";
import { frag, quote, splitName } from "../genutil";
import {
  allowsLiterals,
  generateFuncopDef,
  generateFuncopTypes,
  getReturnCardinality,
} from "./generateFunctionTypes";
import {
  getTypesSpecificity,
  sortFuncopOverloads,
  getImplicitCastableRootTypes,
  expandFuncopAnytypeOverloads,
  findPathOfAnytype,
  type FuncopDefOverload,
} from "../funcoputil";
import { $, OperatorKind, StrictMapSet } from "../genutil";
import { getStringRepresentation } from "./generateObjectTypes";

export function generateOperatorFunctions({
  dir,
  operators,
  types,
  casts,
}: GeneratorParams) {
  generateFuncopTypes(
    dir,
    types,
    casts,
    operators,
    "Operator",
    "OpExpr",
    false,
    (code, _opDef, _args, _namedArgs, returnType) => {
      // Name
      // code.writeln([t`${quote(opDef.originalName)},`]);
      // OperatorKind
      // code.writeln([t`$.OperatorKind.${opDef.operator_kind},`]);
      // Args
      // code.writeln([t`${args}`]);
      // ReturnType
      code.writeln([t`${returnType}`]);
    },
    (code, _opName, opDefs) => {
      code.writeln([r`__name__: ${quote(opDefs[0].originalName)},`]);
      code.writeln([r`__opkind__: kind,`]);
      code.writeln([r`__args__: positionalArgs,`]);
    },
  );
}

const skipOperators = new Set<string>([
  "std::index",
  "std::slice",
  "std::destructure",
]);

interface BaseOperator {
  operatorSymbol: string;
}

interface PrefixOperator extends BaseOperator {
  kind: OperatorKind.Prefix;
  operand: CodeFragment[];
  returnElement: "BOOLEAN" | "HOMOGENEOUS";
  returnCardinality: "PARAM" | "ONE";
}

interface PrefixBooleanOperator extends PrefixOperator {
  returnElement: "BOOLEAN";
  returnCardinality: "PARAM";
}

interface PrefixBooleanOneOperator extends PrefixOperator {
  returnElement: "BOOLEAN";
  returnCardinality: "ONE";
}

interface PrefixHomogeneousOperator extends PrefixOperator {
  returnElement: "HOMOGENEOUS";
  returnCardinality: "PARAM";
}

interface InfixOperator extends BaseOperator {
  kind: OperatorKind.Infix;
  args: CodeFragment[];
  returnElement:
    | "BOOLEAN"
    | "SCALAR"
    | "CONTAINER"
    | "RANGE_TYPE"
    | "MULTI_RANGE_TYPE"
    | "OBJECT_ARRAY_TYPE"
    | "ARRAY_TYPE"
    | "BASE_TYPE"
    | "MERGE";
  returnCardinality:
    | "MULTIPLY"
    | "MULTIPLY_OPTIONAL"
    | "MULTIPLY_ONE"
    | "MERGE"
    | "MANY"
    | "COALESCE";
}

interface InfixBooleanMultiplyOperator extends InfixOperator {
  returnElement: "BOOLEAN";
  returnCardinality: "MULTIPLY";
}

interface InfixBooleanMultiplyOptionalOperator extends InfixOperator {
  returnElement: "BOOLEAN";
  returnCardinality: "MULTIPLY_OPTIONAL";
}

interface InfixBooleanMultiplyOneOperator extends InfixOperator {
  returnElement: "BOOLEAN";
  returnCardinality: "MULTIPLY_ONE";
}

interface InfixScalarMultiplyOperator extends InfixOperator {
  returnElement: "SCALAR";
  returnCardinality: "MULTIPLY";
}

interface InfixContainerMultiplyOperator extends InfixOperator {
  returnElement: "CONTAINER";
  returnCardinality: "MULTIPLY";
}

interface InfixRangeTypeMultiplyOperator extends InfixOperator {
  returnElement: "RANGE_TYPE";
  returnCardinality: "MULTIPLY";
}

interface InfixMultiRangeTypeMultiplyOperator extends InfixOperator {
  returnElement: "MULTI_RANGE_TYPE";
  returnCardinality: "MULTIPLY";
}

interface InfixArrayTypeMultiplyOperator extends InfixOperator {
  returnElement: "ARRAY_TYPE";
  returnCardinality: "MULTIPLY";
}

interface InfixObjectArrayTypeMultiplyOperator extends InfixOperator {
  returnElement: "OBJECT_ARRAY_TYPE";
  returnCardinality: "MULTIPLY";
}

interface InfixBaseTypeMultiplyOneOperator extends InfixOperator {
  returnElement: "BASE_TYPE";
  returnCardinality: "MULTIPLY_ONE";
}

interface InfixBaseTypeMergeOperator extends InfixOperator {
  returnElement: "BASE_TYPE";
  returnCardinality: "MERGE";
}

interface InfixMergeOperator extends InfixOperator {
  returnElement: "MERGE";
  returnCardinality: "MERGE";
}

interface InfixMergeManyOperator extends InfixOperator {
  returnElement: "MERGE";
  returnCardinality: "MANY";
}

interface InfixCoalesceContainerOperator extends InfixOperator {
  returnElement: "CONTAINER";
  returnCardinality: "COALESCE";
}

interface InfixCoalesceBaseTypeOperator extends InfixOperator {
  returnElement: "BASE_TYPE";
  returnCardinality: "COALESCE";
}

interface InfixCoalesceObjectOperator extends InfixOperator {
  returnElement: "MERGE";
  returnCardinality: "COALESCE";
}

interface TernaryOperator extends BaseOperator {
  kind: OperatorKind.Ternary;
  args: CodeFragment[];
  returnElement: "CONTAINER" | "BASE_TYPE" | "MERGE";
}

interface TernaryContainerOperator extends TernaryOperator {
  returnElement: "CONTAINER";
}

interface TernaryBaseTypeOperator extends TernaryOperator {
  returnElement: "BASE_TYPE";
}

interface TernaryMergeOperator extends TernaryOperator {
  returnElement: "MERGE";
}

type Operator =
  | PrefixBooleanOperator
  | PrefixBooleanOneOperator
  | PrefixHomogeneousOperator
  | InfixBooleanMultiplyOperator
  | InfixBooleanMultiplyOptionalOperator
  | InfixBooleanMultiplyOneOperator
  | InfixScalarMultiplyOperator
  | InfixContainerMultiplyOperator
  | InfixRangeTypeMultiplyOperator
  | InfixMultiRangeTypeMultiplyOperator
  | InfixArrayTypeMultiplyOperator
  | InfixObjectArrayTypeMultiplyOperator
  | InfixBaseTypeMultiplyOneOperator
  | InfixBaseTypeMergeOperator
  | InfixMergeOperator
  | InfixMergeManyOperator
  | InfixCoalesceContainerOperator
  | InfixCoalesceBaseTypeOperator
  | InfixCoalesceObjectOperator
  | TernaryContainerOperator
  | TernaryBaseTypeOperator
  | TernaryMergeOperator;

type OverloadArg =
  FuncopDefOverload<$.introspect.OperatorDef>["params"]["positional"][number];

function operatorFromOpDef(
  typeToCodeFragment: (type: OverloadArg) => CodeFragment[],
  opName: string,
  opDef: FuncopDefOverload<$.introspect.OperatorDef>,
): Operator {
  const operatorSymbol =
    opName === "std::if_else"
      ? "if_else"
      : splitName(opDef.originalName).name.toLowerCase();
  const log = debug(`gel:codegen:operatorFromOpDef:${opName}`);
  log({
    opName,
    operatorSymbol,
    returnType: opDef.return_type.name,
    returnTypeMod: opDef.return_typemod,
    anytypes: opDef.anytypes,
    positional: opDef.params.positional,
  });
  if (opName === "std::coalesce") {
    const [lhs, rhs] = opDef.params.positional;
    if (opDef.anytypes?.kind === "noncastable") {
      return {
        kind: OperatorKind.Infix,
        args: frag`infixOperandsBaseType<${typeToCodeFragment(lhs)}>`,
        returnElement: "BASE_TYPE",
        returnCardinality: "COALESCE",
        operatorSymbol,
      };
    } else if (
      opDef.anytypes?.returnAnytypeWrapper === "_.syntax.mergeObjectTypes"
    ) {
      return {
        kind: OperatorKind.Infix,
        args: frag`{ lhs: ${typeToCodeFragment(lhs)}, rhs: ${typeToCodeFragment(rhs)} }`,
        returnElement: "MERGE",
        returnCardinality: "COALESCE",
        operatorSymbol,
      };
    } else {
      return {
        kind: OperatorKind.Infix,
        args: frag`{ lhs: ${typeToCodeFragment(lhs)}, rhs: ${typeToCodeFragment(rhs)} }`,
        returnElement: "CONTAINER",
        returnCardinality: "COALESCE",
        operatorSymbol,
      };
    }
  }

  const anytypeIsBaseType = Boolean(opDef.anytypes?.type[0] === "$.BaseType");

  if (opDef.operator_kind === $.OperatorKind.Prefix) {
    // Prefix
    const [operand] = opDef.params.positional;
    const returnCardinality = getReturnCardinality(
      opDef.name,
      [{ ...operand, genTypeName: "Operand" }],
      opDef.return_typemod,
      false,
    );
    log({ returnCardinality });
    if (opDef.return_type.name === "std::bool") {
      // Predicate
      return {
        kind: OperatorKind.Prefix,
        operand: typeToCodeFragment(operand),
        operatorSymbol,
        returnElement: "BOOLEAN",
        returnCardinality:
          returnCardinality.type === "IDENTITY" &&
          returnCardinality.param.type === "ONE"
            ? "ONE"
            : "PARAM",
      };
    } else {
      // Homogenous
      return {
        kind: OperatorKind.Prefix,
        operand: typeToCodeFragment(operand),
        operatorSymbol,
        returnElement: "HOMOGENEOUS",
        returnCardinality: "PARAM",
      };
    }
  } else if (opDef.operator_kind === $.OperatorKind.Infix) {
    // Infix
    const [lhsType, rhsType] = opDef.params.positional;
    const getArgsFromAnytypes = () => {
      if (opDef.anytypes && opDef.anytypes.kind === "noncastable") {
        if (opDef.anytypes.typeObj.kind === "range") {
          return frag`infixOperandsRangeType<${typeToCodeFragment(lhsType)}>`;
        } else if (opDef.anytypes.typeObj.kind === "multirange") {
          return frag`infixOperandsMultiRangeType<${typeToCodeFragment(lhsType)}>`;
        } else if (opDef.anytypes.typeObj.kind === "array") {
          return frag`infixOperandsArrayTypeNonArray<${typeToCodeFragment(
            lhsType,
          )}>`;
        } else if (opDef.anytypes.typeObj.kind === "unknown") {
          return frag`infixOperandsBaseType<${typeToCodeFragment(lhsType)}>`;
        }
      }

      return frag`{ lhs: ${typeToCodeFragment(lhsType)}; rhs: ${typeToCodeFragment(rhsType)} }`;
    };
    const _returnCardinality = getReturnCardinality(
      opDef.name,
      [
        { ...lhsType, genTypeName: "LHS" },
        { ...rhsType, genTypeName: "RHS" },
      ],
      opDef.return_typemod,
      false,
    );
    if (opDef.return_type.name === "std::bool") {
      const returnCardinality =
        _returnCardinality.type === "MULTIPLY"
          ? _returnCardinality.params.every((p) => p.type === "OPTIONAL")
            ? "MULTIPLY_OPTIONAL"
            : _returnCardinality.params[1].type === "ONE"
              ? "MULTIPLY_ONE"
              : "MULTIPLY"
          : "MULTIPLY";

      if (lhsType.type.kind === "scalar") {
        // Scalar
        return {
          kind: OperatorKind.Infix,
          args: frag`{ lhs: ${typeToCodeFragment(lhsType)}, rhs: ${typeToCodeFragment(rhsType)} }`,
          operatorSymbol,
          returnElement: "BOOLEAN",
          returnCardinality,
        };
      } else {
        // Container
        return {
          kind: OperatorKind.Infix,
          args: getArgsFromAnytypes(),
          operatorSymbol,
          returnElement: "BOOLEAN",
          returnCardinality,
        };
      }
    }

    if (lhsType.type.kind === "scalar") {
      // Scalar
      return {
        kind: OperatorKind.Infix,
        args: getArgsFromAnytypes(),
        operatorSymbol,
        returnElement: "SCALAR",
        returnCardinality: "MULTIPLY",
      };
    } else {
      // Container
      // Homogenous
      if (opDef.anytypes) {
        if (opDef.return_type.name === "array<anytype>") {
          if (
            opDef.anytypes.kind === "castable" &&
            opDef.anytypes.returnAnytypeWrapper === "_.syntax.mergeObjectTypes"
          ) {
            return {
              kind: OperatorKind.Infix,
              args: getArgsFromAnytypes(),
              operatorSymbol,
              returnElement: "OBJECT_ARRAY_TYPE",
              returnCardinality: "MULTIPLY",
            };
          }
          return {
            kind: OperatorKind.Infix,
            args: getArgsFromAnytypes(),
            operatorSymbol,
            returnElement: "ARRAY_TYPE",
            returnCardinality: "MULTIPLY",
          };
        }
        if (opDef.anytypes.kind === "noncastable") {
          if (opDef.anytypes.typeObj.kind === "range") {
            return {
              kind: OperatorKind.Infix,
              args: getArgsFromAnytypes(),
              operatorSymbol,
              returnElement: "RANGE_TYPE",
              returnCardinality: "MULTIPLY",
            };
          } else if (opDef.anytypes.typeObj.kind === "multirange") {
            return {
              kind: OperatorKind.Infix,
              args: getArgsFromAnytypes(),
              operatorSymbol,
              returnElement: "MULTI_RANGE_TYPE",
              returnCardinality: "MULTIPLY",
            };
          } else if (opDef.anytypes.typeObj.kind === "unknown") {
            const returnCardinality =
              _returnCardinality.type === "MERGE" ? "MERGE" : "MULTIPLY_ONE";
            return {
              kind: OperatorKind.Infix,
              args: getArgsFromAnytypes(),
              operatorSymbol,
              returnElement: "BASE_TYPE",
              returnCardinality,
            };
          } else {
            throw new Error(
              `Unexpected anytype in container homogeneous operator defintion: ${JSON.stringify(opDef, null, 2)}`,
            );
          }
        } else {
          if (
            opDef.anytypes.returnAnytypeWrapper === "_.syntax.mergeObjectTypes"
          ) {
            return {
              kind: OperatorKind.Infix,
              args: getArgsFromAnytypes(),
              operatorSymbol,
              returnElement: "MERGE",
              returnCardinality:
                _returnCardinality.type === "MANY" ? "MANY" : "MERGE",
            };
          }
        }
      }

      return {
        kind: OperatorKind.Infix,
        args: getArgsFromAnytypes(),
        operatorSymbol,
        returnElement: "CONTAINER",
        returnCardinality: "MULTIPLY",
      };
    }
  } else if (opDef.operator_kind === $.OperatorKind.Ternary) {
    // Ternary
    const [lhs, _cond, rhs] = opDef.params.positional;
    if (anytypeIsBaseType) {
      return {
        kind: OperatorKind.Ternary,
        args: frag`infixOperandsBaseType<${typeToCodeFragment(lhs)}>`,
        operatorSymbol,
        returnElement: "BASE_TYPE",
      };
    }
    if (
      opDef.anytypes?.kind === "castable" &&
      opDef.anytypes.returnAnytypeWrapper === "_.syntax.mergeObjectTypes"
    ) {
      return {
        kind: OperatorKind.Ternary,
        args: frag`{ lhs: ${typeToCodeFragment(lhs)}, rhs: ${typeToCodeFragment(rhs)} }`,
        operatorSymbol,
        returnElement: "MERGE",
      };
    }

    return {
      kind: OperatorKind.Ternary,
      args: frag`{ lhs: ${typeToCodeFragment(lhs)}, rhs: ${typeToCodeFragment(rhs)} }`,
      operatorSymbol,
      returnElement: "CONTAINER",
    };
  } else {
    throw new Error(`Unknown operator kind: ${opDef.operator_kind}`);
  }
}

export function generateOperators({
  dir,
  operators,
  types,
  casts,
}: GeneratorParams) {
  const typeSpecificities = getTypesSpecificity(types, casts);
  const implicitCastableRootTypes = getImplicitCastableRootTypes(casts);
  const code = dir.getPath("operators");

  code.addImportStar("$", "./reflection", { allowFileExt: true });
  code.addImportStar("_", "./imports", { allowFileExt: true });

  const overloadsBuf = new CodeBuffer();

  const overloadDefs: {
    [opKind: string]: { [opSymbol: string]: string[] };
  } = {};
  for (const opKind of Object.values($.OperatorKind)) {
    overloadDefs[opKind] = {};
  }

  const prefixBooleanDefs = new StrictMapSet<string, PrefixBooleanOperator>();
  const prefixBooleanOneDefs = new StrictMapSet<
    string,
    PrefixBooleanOneOperator
  >();
  const prefixHomogeneousDefs = new StrictMapSet<
    string,
    PrefixHomogeneousOperator
  >();
  const infixBooleanMultiplyDefs = new StrictMapSet<
    string,
    InfixBooleanMultiplyOperator
  >();
  const infixBooleanMultiplyOptionalDefs = new StrictMapSet<
    string,
    InfixBooleanMultiplyOptionalOperator
  >();
  const infixBooleanMultiplyOneDefs = new StrictMapSet<
    string,
    InfixBooleanMultiplyOneOperator
  >();
  const infixScalarMultiplyDefs = new StrictMapSet<
    string,
    InfixScalarMultiplyOperator
  >();
  const infixContainerMultiplyDefs = new StrictMapSet<
    string,
    InfixContainerMultiplyOperator
  >();
  const infixRangeTypeMultiplyDefs = new StrictMapSet<
    string,
    InfixRangeTypeMultiplyOperator
  >();
  const infixMultiRangeTypeMultiplyDefs = new StrictMapSet<
    string,
    InfixMultiRangeTypeMultiplyOperator
  >();
  const infixArrayTypeMultiplyDefs = new StrictMapSet<
    string,
    InfixArrayTypeMultiplyOperator
  >();
  const infixObjectArrayTypeMultiplyDefs = new StrictMapSet<
    string,
    InfixObjectArrayTypeMultiplyOperator
  >();
  const infixBaseTypeMultiplyOneDefs = new StrictMapSet<
    string,
    InfixBaseTypeMultiplyOneOperator
  >();
  const infixBaseTypeMergeDefs = new StrictMapSet<
    string,
    InfixBaseTypeMergeOperator
  >();
  const infixMergeDefs = new StrictMapSet<string, InfixMergeOperator>();
  const infixMergeManyDefs = new StrictMapSet<string, InfixMergeManyOperator>();
  const infixCoalesceContainerDefs = new StrictMapSet<
    string,
    InfixCoalesceContainerOperator
  >();
  const infixCoalesceBaseTypeDefs = new StrictMapSet<
    string,
    InfixCoalesceBaseTypeOperator
  >();
  const infixCoalesceObjectDefs = new StrictMapSet<
    string,
    InfixCoalesceObjectOperator
  >();
  const ternaryContainerDefs = new StrictMapSet<
    string,
    TernaryContainerOperator
  >();
  const ternaryBaseTypeDefs = new StrictMapSet<
    string,
    TernaryBaseTypeOperator
  >();
  const ternaryMergeDefs = new StrictMapSet<string, TernaryMergeOperator>();

  for (const [opName, _opDefs] of operators.entries()) {
    if (skipOperators.has(opName)) continue;
    const log = debug(`gel:codegen:generateOperators:${opName}`);
    log(
      _opDefs.map((opDef) => ({
        return_type: opDef.return_type,
        return_typemod: opDef.return_typemod,
        params0: opDef.params[0].type,
        params0_typemod: opDef.params[0].typemod,
        params1: opDef.params[1]?.type,
        params1_typemod: opDef.params[1]?.typemod,
        params2: opDef.params[2]?.type,
        params2_typemod: opDef.params[2]?.typemod,
      })),
    );

    const opDefs = expandFuncopAnytypeOverloads(
      sortFuncopOverloads(_opDefs, typeSpecificities),
      types,
      casts,
      implicitCastableRootTypes,
    );

    let overloadIndex = 0;
    for (const opDef of opDefs) {
      const opSymbol =
        opName === "std::if_else"
          ? "if_else"
          : splitName(opDef.originalName).name.toLowerCase();

      if (opDef.overloadIndex === overloadIndex) {
        if (!overloadDefs[opDef.operator_kind][opSymbol]) {
          overloadDefs[opDef.operator_kind][opSymbol] = [];
        }

        overloadDefs[opDef.operator_kind][opSymbol].push(
          generateFuncopDef(opDef),
        );

        overloadIndex++;
      }

      const anytypes = opDef.anytypes;
      const anytypeParams: string[] = [];

      const getParamType = (
        param: (typeof opDef.params.positional)[number],
      ) => {
        const getParamAnytype = (
          paramTypeName: string,
          paramType: $.introspect.Type,
        ) => {
          if (!anytypes) return undefined;
          if (anytypes.kind === "castable") {
            if (paramType.name.includes("anytype")) {
              const path = findPathOfAnytype(paramType.id, types);
              anytypeParams.push(`${paramTypeName}${path}`);
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
        };
        const anytype = getParamAnytype(param.typeName, param.type);

        const paramTypeStr = getStringRepresentation(param.type, {
          types,
          anytype,
          casts: casts.implicitCastFromMap,
        });

        let type = frag`$.TypeSet<${paramTypeStr.staticType}>`;

        if (allowsLiterals(param.type, anytypes)) {
          type = frag`_.castMaps.orScalarLiteral<${type}>`;
          // hasLiterals = true;
        }

        return type;
      };
      /*
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
        types.get(opDef.return_type.id),
        {
          types,
          anytype: returnAnytype,
        }
      );
      */

      const operator = operatorFromOpDef(getParamType, opName, opDef);
      const mapFromOperator = (
        operator: Operator,
      ): StrictMapSet<string, unknown> => {
        switch (operator.kind) {
          case OperatorKind.Prefix:
            if (operator.returnElement === "BOOLEAN") {
              if (operator.returnCardinality === "ONE") {
                return prefixBooleanOneDefs;
              } else if (operator.returnCardinality === "PARAM") {
                return prefixBooleanDefs;
              }
            } else {
              return prefixHomogeneousDefs;
            }
            throw new Error(
              `Unsupported prefix operator: ${opName}: ${(operator as any).returnElement} * ${(operator as any).returnCardinality}`,
            );
          case OperatorKind.Infix:
            if (operator.returnElement === "BOOLEAN") {
              if (operator.returnCardinality === "MULTIPLY") {
                return infixBooleanMultiplyDefs;
              } else if (operator.returnCardinality === "MULTIPLY_OPTIONAL") {
                return infixBooleanMultiplyOptionalDefs;
              } else {
                return infixBooleanMultiplyOneDefs;
              }
            } else if (operator.returnElement === "SCALAR") {
              return infixScalarMultiplyDefs;
            } else if (operator.returnElement === "RANGE_TYPE") {
              return infixRangeTypeMultiplyDefs;
            } else if (operator.returnElement === "MULTI_RANGE_TYPE") {
              return infixMultiRangeTypeMultiplyDefs;
            } else if (operator.returnElement === "ARRAY_TYPE") {
              return infixArrayTypeMultiplyDefs;
            } else if (operator.returnElement === "OBJECT_ARRAY_TYPE") {
              return infixObjectArrayTypeMultiplyDefs;
            } else if (operator.returnElement === "BASE_TYPE") {
              if (operator.returnCardinality === "MULTIPLY_ONE") {
                return infixBaseTypeMultiplyOneDefs;
              } else if (operator.returnCardinality === "MERGE") {
                return infixBaseTypeMergeDefs;
              } else if (operator.returnCardinality === "COALESCE") {
                return infixCoalesceBaseTypeDefs;
              }
            } else if (operator.returnElement === "MERGE") {
              if (operator.returnCardinality === "MERGE") {
                return infixMergeDefs;
              } else if (operator.returnCardinality === "MANY") {
                return infixMergeManyDefs;
              } else if (operator.returnCardinality === "COALESCE") {
                return infixCoalesceObjectDefs;
              }
            } else if (operator.returnElement === "CONTAINER") {
              if (operator.returnCardinality === "MULTIPLY") {
                return infixContainerMultiplyDefs;
              } else if (operator.returnCardinality === "COALESCE") {
                return infixCoalesceContainerDefs;
              }
            }
            throw new Error(
              `Unsupported infix operator: ${opName}: ${(operator as any).returnElement} * ${(operator as any).returnCardinality}`,
            );
          case OperatorKind.Ternary:
            if (operator.returnElement === "CONTAINER") {
              return ternaryContainerDefs;
            } else if (operator.returnElement === "BASE_TYPE") {
              return ternaryBaseTypeDefs;
            } else if (operator.returnElement === "MERGE") {
              return ternaryMergeDefs;
            }
            throw new Error(
              `Unsupported ternary operator: ${opName}: ${(operator as any).returnElement} * ${(operator as any).returnCardinality}`,
            );
          default:
            throw new Error(
              `Unsupported operator kind: ${opName}: ${(operator as any).kind}`,
            );
        }
      };
      const map = mapFromOperator(operator);
      map.appendAt(opSymbol, operator);
    }
  }

  overloadsBuf.writeln([
    t`interface infixOperandsBaseType<LHS extends _.castMaps.orScalarLiteral<$.TypeSet<$.BaseType>>> {`,
  ]);
  overloadsBuf.indented(() => {
    overloadsBuf.writeln([t`lhs: LHS;`]);
    overloadsBuf.writeln([
      t`rhs: _.castMaps.orScalarLiteral<$.TypeSet<$.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>>>;`,
    ]);
  });
  overloadsBuf.writeln([t`}`]);
  overloadsBuf.nl();

  overloadsBuf.writeln([
    t`interface infixOperandsRangeType<LHS extends $.TypeSet<$.RangeType<_std.$anypoint>>> {`,
  ]);
  overloadsBuf.indented(() => {
    overloadsBuf.writeln([t`lhs: LHS;`]);
    overloadsBuf.writeln([
      t`rhs: $.TypeSet<$.RangeType<$.getPrimitiveBaseType<LHS["__element__"]["__element__"]>>>;`,
    ]);
  });
  overloadsBuf.writeln([t`}`]);
  overloadsBuf.nl();

  overloadsBuf.writeln([
    t`interface infixOperandsMultiRangeType<LHS extends $.TypeSet<$.MultiRangeType<_std.$anypoint>>> {`,
  ]);
  overloadsBuf.indented(() => {
    overloadsBuf.writeln([t`lhs: LHS;`]);
    overloadsBuf.writeln([
      t`rhs: $.TypeSet<$.MultiRangeType<$.getPrimitiveBaseType<LHS["__element__"]["__element__"]>>>;`,
    ]);
  });
  overloadsBuf.writeln([t`}`]);
  overloadsBuf.nl();

  overloadsBuf.writeln([
    t`interface infixOperandsArrayTypeNonArray<LHS extends $.TypeSet<$.ArrayType<$.NonArrayType>>> {`,
  ]);
  overloadsBuf.indented(() => {
    overloadsBuf.writeln([t`lhs: LHS;`]);
    overloadsBuf.writeln([
      t`rhs: $.TypeSet<$.ArrayType<$.getPrimitiveNonArrayBaseType<LHS["__element__"]["__element__"]>>>;`,
    ]);
  });
  overloadsBuf.writeln([t`}`]);
  overloadsBuf.nl();

  if (prefixBooleanDefs.size > 0) {
    // PrefixBooleanOperators
    overloadsBuf.writeln([t`interface PrefixBooleanOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of prefixBooleanDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| { operand: ${def.operand}}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (prefixBooleanOneDefs.size > 0) {
    // PrefixBooleanOneOperators
    overloadsBuf.writeln([t`interface PrefixBooleanOneOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of prefixBooleanOneDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| { operand: ${def.operand}}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (prefixHomogeneousDefs.size > 0) {
    // PrefixHomogeneousOperators
    overloadsBuf.writeln([t`interface PrefixHomogeneousOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of prefixHomogeneousDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| { operand: ${def.operand} }`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixBooleanMultiplyDefs.size > 0) {
    // InfixBooleanMultiplyOperators
    overloadsBuf.writeln([t`interface InfixBooleanMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixBooleanMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixBooleanMultiplyOptionalDefs.size > 0) {
    // InfixBooleanMultiplyOptionalOperators
    overloadsBuf.writeln([
      t`interface InfixBooleanMultiplyOptionalOperators {`,
    ]);
    overloadsBuf.indented(() => {
      for (const [
        opSymbol,
        defs,
      ] of infixBooleanMultiplyOptionalDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixBooleanMultiplyOneDefs.size > 0) {
    // InfixBooleanMultiplyOneOperators
    overloadsBuf.writeln([t`interface InfixBooleanMultiplyOneOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixBooleanMultiplyOneDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixScalarMultiplyDefs.size > 0) {
    // InfixScalarMultiplyOperators
    overloadsBuf.writeln([t`interface InfixScalarMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixScalarMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixContainerMultiplyDefs.size > 0) {
    // InfixContainerMultiplyOperators
    overloadsBuf.writeln([t`interface InfixContainerMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixContainerMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixRangeTypeMultiplyDefs.size > 0) {
    // InfixRangeTypeMultiplyOperators
    overloadsBuf.writeln([t`interface InfixRangeTypeMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixRangeTypeMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixMultiRangeTypeMultiplyDefs.size > 0) {
    // InfixMultiRangeTypeMultiplyOperators
    overloadsBuf.writeln([t`interface InfixMultiRangeTypeMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [
        opSymbol,
        defs,
      ] of infixMultiRangeTypeMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixArrayTypeMultiplyDefs.size > 0) {
    // InfixArrayTypeMultiplyOperators
    overloadsBuf.writeln([t`interface InfixArrayTypeMultiplyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixArrayTypeMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixObjectArrayTypeMultiplyDefs.size > 0) {
    // InfixObjectArrayTypeMultiplyOperators
    overloadsBuf.writeln([
      t`interface InfixObjectArrayTypeMultiplyOperators {`,
    ]);
    overloadsBuf.indented(() => {
      for (const [
        opSymbol,
        defs,
      ] of infixObjectArrayTypeMultiplyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixBaseTypeMultiplyOneDefs.size > 0) {
    // InfixBaseTypeMultiplyOneOperators
    overloadsBuf.writeln([t`interface InfixBaseTypeMultiplyOneOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixBaseTypeMultiplyOneDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixBaseTypeMergeDefs.size > 0) {
    // InfixBaseTypeMergeOperators
    overloadsBuf.writeln([t`interface InfixBaseTypeMergeOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixBaseTypeMergeDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixMergeDefs.size > 0) {
    // InfixMergeOperators
    overloadsBuf.writeln([t`interface InfixMergeOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixMergeDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixMergeManyDefs.size > 0) {
    // InfixMergeManyOperators
    overloadsBuf.writeln([t`interface InfixMergeManyOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixMergeManyDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixCoalesceContainerDefs.size > 0) {
    // InfixCoalesceContainerOperators
    overloadsBuf.writeln([t`interface InfixCoalesceContainerOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixCoalesceContainerDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixCoalesceBaseTypeDefs.size > 0) {
    // InfixCoalesceBaseTypeOperators
    overloadsBuf.writeln([t`interface InfixCoalesceBaseTypeOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixCoalesceBaseTypeDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (infixCoalesceObjectDefs.size > 0) {
    // InfixCoalesceObjectOperators
    overloadsBuf.writeln([t`interface InfixCoalesceObjectOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of infixCoalesceObjectDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (ternaryContainerDefs.size > 0) {
    // TernaryContainerOperators
    overloadsBuf.writeln([t`interface TernaryContainerOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of ternaryContainerDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (ternaryBaseTypeDefs.size > 0) {
    // TernaryBaseTypeOperators
    overloadsBuf.writeln([t`interface TernaryBaseTypeOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of ternaryBaseTypeDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  if (ternaryMergeDefs.size > 0) {
    // TernaryMergeOperators
    overloadsBuf.writeln([t`interface TernaryMergeOperators {`]);
    overloadsBuf.indented(() => {
      for (const [opSymbol, defs] of ternaryMergeDefs.entries()) {
        overloadsBuf.writeln([t`${quote(opSymbol)}: `]);
        overloadsBuf.indented(() => {
          for (const def of defs) {
            overloadsBuf.writeln([t`| ${def.args}`]);
          }
        });
      }
    });
    overloadsBuf.writeln([t`}`]);
    overloadsBuf.nl();
  }

  code.writeln([
    r`const overloadDefs`,
    ts`: {
  [opKind in 'Infix' | 'Prefix' | 'Postfix' | 'Ternary']: {
    [opSymbol: string]: any[]
  }
}`,
    r` = {`,
  ]);
  code.indented(() => {
    for (const opKind of Object.keys(overloadDefs)) {
      code.writeln([r`${opKind}: {`]);
      code.indented(() => {
        for (const symbol of Object.keys(overloadDefs[opKind])) {
          code.writeln([r`${quote(symbol)}: [`]);
          code.indented(() => {
            for (const overloadDef of overloadDefs[opKind][symbol]) {
              code.writeln([r`${overloadDef},`]);
            }
          });
          code.writeln([r`],`]);
        }
      });
      code.writeln([r`},`]);
    }
  });
  code.writeln([r`};`]);
  code.nl();

  code.writeBuf(overloadsBuf);

  code.nl();

  // Utility type for extracting the correct union member for an operator
  code.writeln([t`type ExtractRHS<T, LHS> =`]);
  code.indented(() => {
    code.writeln([
      t`T extends { lhs: infer LHSType; rhs: infer RHSType } ? LHS extends LHSType ? RHSType : never : never;`,
    ]);
  });
  code.nl();

  if (infixBooleanMultiplyDefs.size > 0) {
    // InfixBooleanMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixBooleanMultiplyOperators,`]);
      code.writeln([t`LHS extends InfixBooleanMultiplyOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixBooleanMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([t`Element extends _std.$bool,`]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>,`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixBooleanMultiplyOptionalDefs.size > 0) {
    // InfixBooleanMultiplyOptionalOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Op extends keyof InfixBooleanMultiplyOptionalOperators,`,
      ]);
      code.writeln([
        t`LHS extends InfixBooleanMultiplyOptionalOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixBooleanMultiplyOptionalOperators[Op], LHS>,`,
      ]);
      code.writeln([t`Element extends _std.$bool,`]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.optionalParamCardinality<LHS>, $.cardutil.optionalParamCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixBooleanMultiplyOneDefs.size > 0) {
    // InfixBooleanMultiplyOneOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixBooleanMultiplyOneOperators,`]);
      code.writeln([
        t`LHS extends InfixBooleanMultiplyOneOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixBooleanMultiplyOneOperators[Op], LHS>,`,
      ]);
      code.writeln([t`Element extends _std.$bool,`]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.Cardinality.One>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (prefixBooleanDefs.size > 0) {
    // PrefixBooleanOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof PrefixBooleanOperators,`]);
      code.writeln([t`Operand extends PrefixBooleanOperators[Op]["operand"],`]);
    });
    code.writeln([
      t`>(op: Op, operand: Operand): $.$expr_Operator<_std.$bool, $.cardutil.paramCardinality<Operand>>;`,
    ]);
    code.nl();
  }

  if (prefixBooleanOneDefs.size > 0) {
    // PrefixBooleanOneOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof PrefixBooleanOneOperators,`]);
      code.writeln([
        t`Operand extends PrefixBooleanOneOperators[Op]["operand"],`,
      ]);
    });
    code.writeln([
      t`>(op: Op, operand: Operand): $.$expr_Operator<_std.$bool, $.Cardinality.One>;`,
    ]);
    code.nl();
  }

  if (prefixHomogeneousDefs.size > 0) {
    // PrefixHomogeneousOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof PrefixHomogeneousOperators,`]);
      code.writeln([
        t`Operand extends PrefixHomogeneousOperators[Op]["operand"],`,
      ]);
      code.writeln([
        t`Element extends _.castMaps.literalToTypeSet<Operand>["__element__"],`,
      ]);
      code.writeln([t`Card extends $.cardutil.paramCardinality<Operand>`]);
    });
    code.writeln([
      t`>(op: Op, operand: Operand): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixScalarMultiplyDefs.size > 0) {
    // InfixScalarMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixScalarMultiplyOperators,`]);
      code.writeln([t`LHS extends InfixScalarMultiplyOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixScalarMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>,`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixCoalesceBaseTypeDefs.size > 0) {
    // InfixCoalesceBaseTypeOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixCoalesceBaseTypeOperators,`]);
      code.writeln([t`LHS extends InfixCoalesceBaseTypeOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixCoalesceBaseTypeOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.coalesceCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixCoalesceContainerDefs.size > 0) {
    // InfixCoalesceContainerOperator
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixCoalesceContainerOperators,`]);
      code.writeln([
        t`LHS extends InfixCoalesceContainerOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixCoalesceContainerOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends _.syntax.getSharedParentPrimitive<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.coalesceCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixCoalesceObjectDefs.size > 0) {
    // InfixCoalesceObjectOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixCoalesceObjectOperators,`]);
      code.writeln([t`LHS extends InfixCoalesceObjectOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixCoalesceObjectOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends _.syntax.mergeObjectTypes<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.coalesceCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixContainerMultiplyDefs.size > 0) {
    // InfixContainerMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixContainerMultiplyOperators,`]);
      code.writeln([
        t`LHS extends InfixContainerMultiplyOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixContainerMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends _.syntax.getSharedParentPrimitive<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixRangeTypeMultiplyDefs.size > 0) {
    // InfixRangeTypeMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixRangeTypeMultiplyOperators,`]);
      code.writeln([
        t`LHS extends InfixRangeTypeMultiplyOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixRangeTypeMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.RangeType<$.getPrimitiveBaseType<LHS["__element__"]["__element__"]>>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixMultiRangeTypeMultiplyDefs.size > 0) {
    // InfixMultiRangeTypeMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixMultiRangeTypeMultiplyOperators,`]);
      code.writeln([
        t`LHS extends InfixMultiRangeTypeMultiplyOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixMultiRangeTypeMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.MultiRangeType<$.getPrimitiveBaseType<LHS["__element__"]["__element__"]>>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixArrayTypeMultiplyDefs.size > 0) {
    // InfixArrayTypeMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixArrayTypeMultiplyOperators,`]);
      code.writeln([
        t`LHS extends InfixArrayTypeMultiplyOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixArrayTypeMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.ArrayType<_.syntax.getSharedParentPrimitive<LHS["__element__"]["__element__"], RHS["__element__"]["__element__"]>>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixObjectArrayTypeMultiplyDefs.size > 0) {
    // InfixObjectArrayTypeMultiplyOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Op extends keyof InfixObjectArrayTypeMultiplyOperators,`,
      ]);
      code.writeln([
        t`LHS extends InfixObjectArrayTypeMultiplyOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixObjectArrayTypeMultiplyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.ArrayType<_.syntax.mergeObjectTypes<LHS["__element__"]["__element__"], RHS["__element__"]["__element__"]>>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixBaseTypeMultiplyOneDefs.size > 0) {
    // InfixBaseTypeMultiplyOneOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixBaseTypeMultiplyOneOperators,`]);
      code.writeln([
        t`LHS extends InfixBaseTypeMultiplyOneOperators[Op]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixBaseTypeMultiplyOneOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.multiplyCardinalities<$.cardutil.paramCardinality<LHS>, $.Cardinality.One>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixBaseTypeMergeDefs.size > 0) {
    // InfixBaseTypeMergeOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixBaseTypeMergeOperators,`]);
      code.writeln([t`LHS extends InfixBaseTypeMergeOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixBaseTypeMergeOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends $.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.mergeCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixMergeDefs.size > 0) {
    // InfixMergeOperator
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixMergeOperators,`]);
      code.writeln([t`LHS extends InfixMergeOperators[Op]["lhs"],`]);
      code.writeln([t`RHS extends ExtractRHS<InfixMergeOperators[Op], LHS>,`]);
      code.writeln([
        t`Element extends _.syntax.mergeObjectTypes<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`Card extends $.cardutil.mergeCardinalities<$.cardutil.paramCardinality<LHS>, $.cardutil.paramCardinality<RHS>>`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (infixMergeManyDefs.size > 0) {
    // InfixMergeManyOperator
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([t`Op extends keyof InfixMergeManyOperators,`]);
      code.writeln([t`LHS extends InfixMergeManyOperators[Op]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<InfixMergeManyOperators[Op], LHS>,`,
      ]);
      code.writeln([
        t`Element extends _.syntax.mergeObjectTypes<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([t`Card extends $.Cardinality.Many`]);
    });
    code.writeln([
      t`>(lhs: LHS, op: Op, rhs: RHS): $.$expr_Operator<Element, Card>;`,
    ]);
    code.nl();
  }

  if (ternaryContainerDefs.size > 0) {
    // TernaryContainerOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([
        t`LHS extends TernaryContainerOperators["if_else"]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryContainerOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op1: "if", cond: Cond, op2: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`_.syntax.getSharedParentPrimitive<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([
        t`LHS extends TernaryContainerOperators["if_else"]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryContainerOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(op1: "if", cond: Cond, op2: "then", lhs: LHS, op3: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`_.syntax.getSharedParentPrimitive<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.nl();
  }

  if (ternaryBaseTypeDefs.size > 0) {
    // TernaryBaseTypeOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([
        t`LHS extends TernaryBaseTypeOperators["if_else"]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryBaseTypeOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op1: "if", cond: Cond, op2: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`$.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([
        t`LHS extends TernaryBaseTypeOperators["if_else"]["lhs"],`,
      ]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryBaseTypeOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(op1: "if", cond: Cond, op2: "then", lhs: LHS, op3: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`$.getPrimitiveBaseType<_.castMaps.literalToTypeSet<LHS>["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.nl();
  }

  if (ternaryMergeDefs.size > 0) {
    // TernaryMergeOperators
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([t`LHS extends TernaryMergeOperators["if_else"]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryMergeOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(lhs: LHS, op1: "if", cond: Cond, op2: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`_.syntax.mergeObjectTypes<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.writeln([t`function op<`]);
    code.indented(() => {
      code.writeln([
        t`Cond extends _.castMaps.orScalarLiteral<$.TypeSet<_std.$bool>>,`,
      ]);
      code.writeln([t`LHS extends TernaryMergeOperators["if_else"]["lhs"],`]);
      code.writeln([
        t`RHS extends ExtractRHS<TernaryMergeOperators["if_else"], LHS>,`,
      ]);
    });
    code.writeln([
      t`>(op1: "if", cond: Cond, op2: "then", lhs: LHS, op3: "else", rhs: RHS): $.$expr_Operator<`,
    ]);
    code.indented(() => {
      code.writeln([
        t`_.syntax.mergeObjectTypes<LHS["__element__"], RHS["__element__"]>,`,
      ]);
      code.writeln([
        t`$.cardutil.multiplyCardinalities<$.cardutil.orCardinalities<$.cardutil.paramCardinality<LHS> , $.cardutil.paramCardinality<RHS>>, $.cardutil.paramCardinality<Cond>>`,
      ]);
    });
    code.writeln([t`>;`]);
    code.nl();
  }

  // Implementation
  code.writeln([r`function op(...args`, ts`: any[]`, r`) {`]);
  code.indented(() => {
    code.writeln([
      r`let op`,
      ts`: string`,
      r` = "";
  let params`,
      ts`: any[]`,
      r` = [];
  let defs`,
      ts`: any[] | null | undefined`,
      r` = null;
  if (args.length === 2) {
    if (typeof args[0] === "string" && overloadDefs.Prefix[args[0]]) {
      op = args[0];
      params = [args[1]];
      defs = overloadDefs.Prefix[op];
    } else if (typeof args[1] === "string" && overloadDefs.Postfix[args[1]]) {
      op = args[1];
      params = [args[0]];
      defs = overloadDefs.Postfix[op];
    }
  } else if (args.length === 3) {
    if (typeof args[1] === "string") {
      op = args[1];
      params = [args[0], args[2]];
      defs = overloadDefs.Infix[op];
    }
  } else if (args.length === 5) {
    if (typeof args[1] === "string" && typeof args[3] === "string") {
      // Python-style if-else
      op = \`\${args[1]}_\${args[3]}\`;
      params = [args[0], args[2], args[4]];
      defs = overloadDefs.Ternary[op];
    }
  } else if (args.length === 6) {
    // Functional-style if-then-else
    if (typeof args[0] === "string" && typeof args[2] === "string" && typeof args[4] === "string") {
      op = \`\${args[0]}_\${args[4]}\`;
      params = [args[3], args[1], args[5]];
      defs = overloadDefs.Ternary[op];
    }
  }

  if (!defs) {
    throw new Error(\`No operator exists with signature: \${args.map(arg => \`\${arg}\`).join(", ")}\`);
  }`,
    ]);

    code.nl();
    code.writeln([
      r`const {kind, returnType, cardinality, args: resolvedArgs} = _.syntax.$resolveOverload(op, params, _.spec, defs);`,
    ]);
    code.nl();
    code.writeln([r`return _.syntax.$expressionify({`]);
    code.indented(() => {
      code.writeln([r`__kind__: $.ExpressionKind.Operator,`]);
      code.writeln([r`__element__: returnType,`]);
      code.writeln([r`__cardinality__: cardinality,`]);
      code.writeln([r`__name__: op,`]);
      code.writeln([r`__opkind__: kind,`]);
      code.writeln([r`__args__: resolvedArgs,`]);
    });
    code.writeln([r`})`, ts` as any`, r`;`]);
  });
  code.writeln([r`};`]);

  code.addExport("op");
}
