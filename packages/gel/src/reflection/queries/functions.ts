import type { Executor } from "../../ifaces";
import { StrictMap } from "../strictMap";
import type { typeutil } from "../typeutil";
import { typeMapping } from "./types";

export type FuncopTypemod = "SetOfType" | "OptionalType" | "SingletonType";

export type FunctionParamKind =
  | "VariadicParam"
  | "NamedOnlyParam"
  | "PositionalParam";

export interface FuncopParam {
  name: string;
  type: { id: string; name: string };
  kind: FunctionParamKind;
  typemod: FuncopTypemod;
  hasDefault?: boolean;
}

export interface FunctionDef {
  id: string;
  name: string;
  description?: string;
  return_type: { id: string; name: string };
  return_typemod: FuncopTypemod;
  params: FuncopParam[];
  preserves_optionality: boolean;
}

export type FunctionTypes = typeutil.depromisify<ReturnType<typeof functions>>;

export const functions = async (cxn: Executor) => {
  const functionsJson = await cxn.queryJSON(`
    with module schema
    select Function {
      id,
      name,
      annotations: {
        name,
        @value
      } filter .name = 'std::description',
      return_type: {id, name},
      return_typemod,
      params: {
        name,
        type: {id, name},
        kind,
        typemod,
        hasDefault := exists .default,
      } order by @index,
      preserves_optionality,
    } filter .internal = false
  `);

  const functionMap = new StrictMap<string, [FunctionDef, ...FunctionDef[]]>();

  const seenFuncDefHashes = new Set<string>();

  for (const func of JSON.parse(functionsJson)) {
    const { name } = func;
    const funcDef: FunctionDef = {
      ...func,
      description: func.annotations[0]?.["@value"],
    };

    replaceNumberTypes(funcDef);

    const hash = hashFuncDef(funcDef);

    if (!seenFuncDefHashes.has(hash)) {
      if (!functionMap.has(name)) {
        functionMap.set(name, [funcDef]);
      } else {
        functionMap.get(name)!.push(funcDef);
      }
      seenFuncDefHashes.add(hash);
    }
  }

  return functionMap;
};

export function replaceNumberTypes(def: {
  return_type: FunctionDef["return_type"];
  params: FuncopParam[];
}): void {
  if (typeMapping.has(def.return_type.id)) {
    const type = typeMapping.get(def.return_type.id)!;
    def.return_type = {
      id: type.id,
      name: type.name,
    };
  }

  for (const param of def.params) {
    if (typeMapping.has(param.type.id)) {
      const type = typeMapping.get(param.type.id)!;
      param.type = {
        id: type.id,
        name: type.name,
      };
    }
  }
}

function hashFuncDef(def: FunctionDef): string {
  return JSON.stringify({
    name: def.name,
    return_type: def.return_type.id,
    return_typemod: def.return_typemod,
    params: def.params
      .map((param) =>
        JSON.stringify({
          kind: param.kind,
          type: param.type.id,
          typemod: param.typemod,
          hasDefault: !!param.hasDefault,
        }),
      )
      .sort(),
    preserves_optionality: def.preserves_optionality,
  });
}
