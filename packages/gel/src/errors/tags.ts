export const SHOULD_RECONNECT = Symbol("SHOULD_RECONNECT");
export const SHOULD_RETRY = Symbol("SHOULD_RETRY");

export type tags = typeof SHOULD_RECONNECT | typeof SHOULD_RETRY;
