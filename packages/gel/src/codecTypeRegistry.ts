// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OverrideCodecType {}

export type ResolvedCodecType<TDbTypeName, TDefaultTsType> =
  TDbTypeName extends keyof OverrideCodecType
    ? OverrideCodecType[TDbTypeName]
    : TDefaultTsType;
