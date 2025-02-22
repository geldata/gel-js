import { Cardinality as RawCardinality } from "../ifaces";
import { Cardinality } from "./enums";

export namespace util {
  export function assertNever(arg: never, error?: Error): never {
    throw error ?? new Error(`${arg} is supposed to be of "never" type`);
  }

  export function splitName(name: string) {
    if (!name.includes("::")) throw new Error(`Invalid FQN ${name}`);
    const parts = name.split("::");
    return {
      mod: parts.slice(0, -1).join("::"),
      name: parts[parts.length - 1],
    };
  }

  export function toIdent(name: string): string {
    if (name.includes("::")) {
      throw new Error(`toIdent: invalid name ${name}`);
    }
    return name.replace(/([^a-zA-Z0-9_]+)/g, "_");
  }

  export const deduplicate = (args: string[]) => [...new Set(args)];

  export const getFromArrayMap = <T>(map: Record<string, T[]>, id: string) => {
    return map[id] || [];
  };
  type PropertyDef = {
    configurable?: boolean;
    enumerable?: boolean;
    writable?: boolean;
    value?: any;
    set?: (v: any) => any;
    get?: () => any;
  };

  export const defineProperty = <T>(
    obj: T,
    name: string,
    def: PropertyDef & ThisType<T>,
  ): T => {
    return Object.defineProperty(obj, name, def) as any;
  };

  export const defineGetter = <T>(
    obj: T,
    name: string,
    getter: (this: T) => any,
  ): T => {
    return Object.defineProperty(obj, name, {
      get: getter,
      enumerable: true,
    }) as any;
  };

  export const defineMethod = <
    T,
    // Def extends PropertyDef<T, P>
  >(
    obj: T,
    name: string,
    method: (this: T) => any,
  ): T => {
    (obj as any)[name] = method.bind(obj);
    return obj;
  };

  export function flatMap<T, U>(
    array: T[],
    callbackfn: (value: T, index: number, array: T[]) => U[],
  ): U[] {
    return Array.prototype.concat(...array.map(callbackfn));
  }

  type ExcludeDollarPrefixed<S> = S extends `$${string}` ? never : S;

  export type OmitDollarPrefixed<O> = {
    [K in ExcludeDollarPrefixed<keyof O>]: O[K];
  };

  export function omitDollarPrefixed<O extends { [k: string]: any }>(
    object: O,
  ): OmitDollarPrefixed<O> {
    const obj: any = {};
    for (const key of Object.keys(object)) {
      if (!key.startsWith("$")) {
        obj[key] = object[key];
      }
    }
    return obj;
  }

  export const parseCardinality = (
    cardinality: RawCardinality,
  ): Cardinality => {
    switch (cardinality) {
      case RawCardinality.MANY:
        return Cardinality.Many;
      case RawCardinality.ONE:
        return Cardinality.One;
      case RawCardinality.AT_MOST_ONE:
        return Cardinality.AtMostOne;
      case RawCardinality.AT_LEAST_ONE:
        return Cardinality.AtLeastOne;
      case RawCardinality.NO_RESULT:
        return Cardinality.Empty;
    }
    throw new Error(`Unexpected cardinality: ${cardinality}`);
  };
}
