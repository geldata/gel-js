/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2019-present MagicStack Inc. and the Gel authors.
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

import createClient, { Client, ConnectOptions } from "../src/index.node";
import * as process from "node:process";

export interface GelVersion {
  major: number;
  minor: number;
  stage: string;
  stage_no: number;
}

function _getOpts(opts: ConnectOptions): ConnectOptions {
  let config;
  try {
    config = JSON.parse(process.env._JEST_GEL_CONNECT_CONFIG || "");
  } catch {
    throw new Error("Gel Jest test environment is not initialized");
  }
  if (!opts.user) {
    opts.user = "jest";
    opts.password = "jestjest";
  }
  if (!opts.database) {
    opts.database = "jest";
  }
  return { ...config, ...opts };
}

export function getConnectOptions(): ConnectOptions {
  return _getOpts({});
}

export function getClient(opts: ConnectOptions = {}): Client {
  return createClient(_getOpts(opts));
}

export function getAvailableFeatures(): Set<string> {
  return new Set(JSON.parse(process.env._JEST_GEL_AVAILABLE_FEATURES!));
}

export function getGelVersion(): GelVersion {
  return JSON.parse(process.env._JEST_GEL_VERSION!);
}

export function getAvailableExtensions(): Map<
  string,
  { major: number; minor: number }
> {
  return new Map(JSON.parse(process.env._JEST_GEL_AVAILABLE_EXTENSIONS!));
}
