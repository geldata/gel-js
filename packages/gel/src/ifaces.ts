/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2020-present MagicStack Inc. and the Gel authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as chars from "./primitives/chars";

export type ProtocolVersion = [number, number];

export enum OutputFormat {
  BINARY = chars.$b,
  JSON = chars.$j,
  NONE = chars.$n,
}

export enum Cardinality {
  NO_RESULT = chars.$n,
  AT_MOST_ONE = chars.$o,
  ONE = chars.$A,
  MANY = chars.$m,
  AT_LEAST_ONE = chars.$M,
}

export enum Language {
  EDGEQL = chars.$E,
  SQL = chars.$S,
}

export type QueryArgs = Record<string, unknown> | unknown[] | null;
export type SQLQueryArgs = unknown[] | null;

export interface Executor {
  execute(query: string, args?: QueryArgs): Promise<void>;
  executeSQL(query: string, args?: SQLQueryArgs): Promise<void>;
  query<T = unknown>(query: string, args?: QueryArgs): Promise<T[]>;
  querySQL<T = unknown>(query: string, args?: SQLQueryArgs): Promise<T[]>;
  queryJSON(query: string, args?: QueryArgs): Promise<string>;
  querySingle<T = unknown>(query: string, args?: QueryArgs): Promise<T | null>;
  querySingleJSON(query: string, args?: QueryArgs): Promise<string>;
  queryRequired<T = unknown>(
    query: string,
    args?: QueryArgs,
  ): Promise<[T, ...T[]]>;
  queryRequiredJSON(query: string, args?: QueryArgs): Promise<string>;
  queryRequiredSingle<T = unknown>(query: string, args?: QueryArgs): Promise<T>;
  queryRequiredSingleJSON(query: string, args?: QueryArgs): Promise<string>;
}

interface UserCodec {
  encode(value: any): any;
  decode(value: any): any;
}

export type UserCodecs = {
  [typeName: string]: UserCodec;
};

export interface KnownServerSettings {
  suggested_pool_concurrency?: number;
  system_config?: any;
}

export type ServerSettings = KnownServerSettings & Record<string, Uint8Array>;

export interface QueryOptions {
  implicitLimit?: bigint;
  injectTypenames?: boolean;
  injectTypeids?: boolean;
  injectObjectids?: boolean;
}

export interface ClientHandshakeOptions {
  user: string;
  database: string;
  secret_key?: string;
}
