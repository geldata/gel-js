import type { Executor } from "../../ifaces";
import type { typeutil } from "../typeutil";
import { typeMapping } from "./types";

type Cast = {
  id: string;
  source: { id: string; name: string };
  target: { id: string; name: string };
  allow_assignment: boolean;
  allow_implicit: boolean;
};

const reachableFrom: (
  source: string,
  adj: { [k: string]: string[] },
  seen?: Set<string>,
) => string[] = (source, adj, seen = new Set<string>()) => {
  const reachable = new Set<string>();
  if (seen.has(source)) return [];
  seen.add(source);

  (adj[source] || []).map((cast) => {
    reachable.add(cast);
    for (const item of reachableFrom(cast, adj, seen)) {
      reachable.add(item);
    }
  });
  return [...reachable];
};

export type Casts = typeutil.depromisify<ReturnType<typeof casts>>;

export const casts = async (cxn: Executor, params?: { debug?: boolean }) => {
  const allCastsRaw = await cxn.queryJSON(`WITH MODULE schema
        SELECT Cast {
            id,
            source := .from_type { id, name },
            target := .to_type { id, name },
            allow_assignment,
            allow_implicit,
        }
        FILTER .from_type IS ScalarType
        AND .to_type IS ScalarType
        # AND .from_type.is_abstract = false
        # AND .to_type.is_abstract = false
        `);

  const allCasts: Cast[] = JSON.parse(allCastsRaw);
  // initialize castsBySource and types
  const types = new Set<string>();
  const typesById: Record<string, { name: string; id: string }> = {};
  const castsById: Record<string, Cast> = {};
  const castsBySource: Record<string, string[]> = {};
  const implicitCastsBySource: Record<string, string[]> = {};
  const implicitCastsByTarget: Record<string, string[]> = {};
  const assignmentCastsBySource: Record<string, string[]> = {};
  const assignmentCastsByTarget: Record<string, string[]> = {};

  for (const cast of allCasts) {
    if (typeMapping.has(cast.source.id) || typeMapping.has(cast.target.id)) {
      cast.allow_implicit = false;
      cast.allow_assignment = false;
    }

    typesById[cast.source.id] = cast.source;
    typesById[cast.target.id] = cast.target;
    types.add(cast.source.id);
    types.add(cast.target.id);
    castsById[cast.id] = cast;
    castsBySource[cast.source.id] = castsBySource[cast.source.id] || [];
    castsBySource[cast.source.id].push(cast.target.id);

    if (cast.allow_assignment || cast.allow_implicit) {
      assignmentCastsBySource[cast.source.id] ??= [];
      assignmentCastsBySource[cast.source.id].push(cast.target.id);

      assignmentCastsByTarget[cast.target.id] ??= [];
      assignmentCastsByTarget[cast.target.id].push(cast.source.id);
    }

    if (cast.allow_implicit) {
      implicitCastsBySource[cast.source.id] ??= [];
      implicitCastsBySource[cast.source.id].push(cast.target.id);

      implicitCastsByTarget[cast.target.id] ??= [];
      implicitCastsByTarget[cast.target.id].push(cast.source.id);
    }
  }

  const castMap: { [k: string]: string[] } = {};
  const implicitCastMap: { [k: string]: string[] } = {};
  const implicitCastFromMap: { [k: string]: string[] } = {};
  const assignmentCastMap: { [k: string]: string[] } = {};
  const assignableByMap: { [k: string]: string[] } = {};

  for (const type of [...types]) {
    castMap[type] = castsBySource[type] || [];
    implicitCastMap[type] = reachableFrom(type, implicitCastsBySource);
    implicitCastFromMap[type] = reachableFrom(type, implicitCastsByTarget);
    assignmentCastMap[type] = reachableFrom(type, assignmentCastsBySource);
    assignableByMap[type] = reachableFrom(type, assignmentCastsByTarget);
  }

  if (params?.debug === true) {
    console.log(`\nIMPLICIT`);
    for (const [fromId, castArr] of Object.entries(implicitCastMap)) {
      console.log(
        `${typesById[fromId].name} implicitly castable to: [${castArr
          .map((id) => typesById[id].name)
          .join(", ")}]`,
      );
    }
    console.log("");
    for (const [fromId, castArr] of Object.entries(implicitCastFromMap)) {
      console.log(
        `${typesById[fromId].name} implicitly castable from: [${castArr
          .map((id) => typesById[id].name)
          .join(", ")}]`,
      );
    }

    console.log(`\nASSIGNABLE TO`);
    for (const [fromId, castArr] of Object.entries(assignmentCastMap)) {
      console.log(
        `${typesById[fromId].name} assignable to: [${castArr
          .map((id) => typesById[id].name)
          .join(", ")}]`,
      );
    }

    console.log(`\nASSIGNABLE BY`);
    for (const [fromId, castArr] of Object.entries(assignableByMap)) {
      console.log(
        `${typesById[fromId].name} assignable by: [${castArr
          .map((id) => typesById[id].name)
          .join(", ")}]`,
      );
    }

    console.log(`\nEXPLICIT`);
    for (const [fromId, castArr] of Object.entries(castMap)) {
      console.log(
        `${typesById[fromId].name} castable to: [${castArr
          .map((id) => {
            return typesById[id].name;
          })
          .join(", ")}]`,
      );
    }
  }
  return {
    castsById,
    typesById,
    castMap,
    implicitCastMap,
    implicitCastFromMap,
    assignmentCastMap,
    assignableByMap,
  };
};
