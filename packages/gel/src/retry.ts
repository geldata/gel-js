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

import type { BaseRawConnection } from "./baseConn";
import type { CodecsRegistry } from "./codecs/registry";
import type { NormalizedConnectConfig } from "./conUtils";
import * as errors from "./errors";
import { sleep } from "./utils";

export type ConnectWithTimeout = (
  config: NormalizedConnectConfig,
  registry: CodecsRegistry,
) => Promise<BaseRawConnection>;

let lastLoggingAt = 0;

export async function retryingConnect(
  connectWithTimeout: ConnectWithTimeout,
  config: NormalizedConnectConfig,
  registry: CodecsRegistry,
): Promise<BaseRawConnection> {
  const maxTime =
    config.connectionParams.waitUntilAvailable === 0
      ? 0
      : Date.now() + config.connectionParams.waitUntilAvailable;
  while (true) {
    try {
      return await connectWithTimeout(config, registry);
    } catch (e) {
      if (e instanceof errors.ClientConnectionError) {
        if (e.hasTag(errors.SHOULD_RECONNECT)) {
          const now = Date.now();
          if (now > maxTime) {
            throw e;
          }
          if (
            config.logging &&
            (!lastLoggingAt || now - lastLoggingAt > 5000)
          ) {
            lastLoggingAt = now;
            const logMsg = [
              `A client connection error occurred; reconnecting because ` +
                `of "waitUntilAvailable=${config.connectionParams.waitUntilAvailable}".`,
              e,
            ];

            if (
              !config.fromProject &&
              !config.fromEnv &&
              (await config.inProject())
            ) {
              logMsg.push(
                `\n\n\n` +
                  `Hint: it looks like the program is running from a ` +
                  `directory initialized with "gel project init". ` +
                  `Consider calling "gel.connect()" without arguments.` +
                  `\n`,
              );
            }
            console.warn(...logMsg);
          }
        } else {
          throw e;
        }
      } else {
        console.error("Unexpected connection error:", e);
        throw e; // this shouldn't happen
      }
    }

    await sleep(Math.trunc(10 + Math.random() * 200));
  }
}
