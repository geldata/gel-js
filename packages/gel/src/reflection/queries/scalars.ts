import type { Executor } from "../../ifaces";
import { StrictMap } from "../strictMap";
import type { typeutil } from "../typeutil";

/*
  for scalars
    if abstract
      generate union type with all descendants
    if real
      generate declaration
      implicitCasts:
        tuple of all implicitly castable types and non abstract ancestors
      assignableCasts:
        tuple of all assignable castable types and non abstract ancestors

      add all castable
  for objects
    generate declarationd
 */

export type ScalarTypes = typeutil.depromisify<ReturnType<typeof _scalars>>;

const _scalars = async (cxn: Executor) => {
  const scalarArray = await cxn.queryJSON(`with module schema
select InheritingObject {
  id,
  name,
  is_abstract,
  bases: { id, name },
  ancestors: { id, name },
  children := .<bases[IS Type] { id, name },
  descendants := .<ancestors[IS Type] { id, name }
}
FILTER
  InheritingObject IS ScalarType OR
  InheritingObject IS ObjectType;
`);

  const scalars = new StrictMap<
    string,
    {
      id: string;
      name: string;
      is_abstract: boolean;
      bases: { id: string; name: string }[];
      ancestors: { id: string; name: string }[];
      children: { id: string; name: string }[];
      descendants: { id: string; name: string }[];
    }
  >();

  for (const type of JSON.parse(scalarArray)) {
    scalars.set(type.id, type);
  }

  return scalars;
  // initialize castsBySource and types
  // const types = new Set<string>();
  // const castsBySource: {[k: string]: Cast[]} = {};
  // for (const cast of allScalars) {
  //   types.add(cast.source);
  //   types.add(cast.target);
  //   castsBySource[cast.source] = castsBySource[cast.source] || [];
  //   castsBySource[cast.target] = castsBySource[cast.target] || [];
  // }

  // const implicitCasts = allScalars.filter((c) => c.allow_implicit);

  // for (const cast of implicitCasts) {
  //   castsBySource[cast.source].push(cast);
  // }

  // const reachableFrom: (source: string) => string[] = (source: string) => {
  //   const reachable = new Set<string>();
  //   (castsBySource[source] || []).map((cast) => {
  //     reachable.add(cast.target);
  //     for (const item of reachableFrom(cast.target)) {
  //       reachable.add(item);
  //     }
  //   });
  //   return [...reachable];
  // };

  // const castsFrom: {[k: string]: string[]} = {};
  // for (const type of [...types]) {
  //   castsFrom[type] = reachableFrom(type);
  // }
  // // console.log(JSON.stringify(castsFrom, null, 2));
  // return castsFrom;
  // // return castsResult;
};
export { _scalars as scalars };
