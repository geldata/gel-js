export namespace typeutil {
  export type assertEqual<T, Expected> = [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : false
    : false;

  export type depromisify<T> = T extends Promise<infer U> ? depromisify<U> : T;
  export type identity<T> = T;
  export type flatten<T> = { [k in keyof T]: T[k] } & unknown;
  export type tupleOf<T> = [T, ...T[]] | [];
  export type writeable<T> = { -readonly [P in keyof T]: T[P] };

  export type nonNeverKeys<T> = {
    [k in keyof T]: [T[k]] extends [never] ? never : k;
  }[keyof T];

  export type stripNever<T> = {
    [k in nonNeverKeys<T>]: k extends keyof T ? T[k] : never;
  };

  export type optionalKeys<T extends object> = {
    [k in keyof T]: undefined extends T[k] ? k : never;
  }[keyof T];

  export type requiredKeys<T extends object> = Exclude<
    keyof T,
    optionalKeys<T>
  >;

  export type addQuestionMarks<T extends object> = {
    [k in optionalKeys<T>]?: T[k];
  } & { [k in requiredKeys<T>]: T[k] };
}
