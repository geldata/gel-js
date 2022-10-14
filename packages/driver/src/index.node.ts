/*!
 * This source file is part of the EdgeDB open source project.
 *
 * Copyright 2019-present MagicStack Inc. and the EdgeDB authors.
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

import {createClient} from "./nodeClient";
export default createClient;

export {createClient, createHttpClient} from "./nodeClient";

import * as adapter from "./adapter.node";
export {adapter};

export {RawConnection as _RawConnection} from "./rawConn";
export type {Executor} from "./ifaces";
export type {Client, ConnectOptions} from "./baseClient";
export {
  IsolationLevel,
  RetryCondition,
  RetryOptions,
  Session
} from "./options";
export {defaultBackoff} from "./options";
export type {BackoffFunction} from "./options";

export * from "./index.shared";
export * as $ from "./reflection";
export {prettyPrintError} from "./prettyPrint";
