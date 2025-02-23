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

import { spawn } from "node:child_process";
import { TransactionConflictError, InterfaceError } from "../src/index.node";
import { sleep } from "../src/utils";
import Event from "../src/primitives/event";
import { getClient, getConnectOptions } from "./testbase";

test("lazy connect + concurrency", async () => {
  let client = getClient();

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(0);
  // @ts-ignore
  expect(client.pool._holders.length).toEqual(1);

  await client.query(`select 1`);

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(1);
  // @ts-ignore
  expect(client.pool._holders.length).toBeGreaterThan(1);

  await client.close();

  client = getClient({ concurrency: 3 });

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(0);
  // @ts-ignore
  expect(client.pool._holders.length).toEqual(3);

  await client.ensureConnected();

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(1);
  // @ts-ignore
  expect(client.pool._holders.length).toEqual(3);

  await client.ensureConnected();

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(1);

  const promises = Promise.all(
    Array(10)
      .fill(0)
      .map((_, i) => client.query(`select <int16>$i`, { i })),
  );

  // @ts-ignore
  expect(client.pool._getStats().queueLength).toEqual(7);

  await promises;

  // @ts-ignore
  expect(client.pool._getStats().openConnections).toEqual(3);

  await client.close();
});

function timeScriptShutdown(script: string, timeout = 5_000) {
  return new Promise<number>((resolve, reject) => {
    const proc = spawn("node", ["--experimental-fetch", "--eval", script]);

    const timeoutRef = setTimeout(() => {
      proc.kill();
      reject(`script killed by timeout: ${timeout}ms`);
    }, timeout);

    let shutdownStart = 0;
    let err = "";
    proc.stdout.on("data", (data) => {
      if (String(data).trim() === "done") {
        shutdownStart = Date.now();
      }
    });
    proc.stderr.on("data", (data) => {
      err += data;
    });

    proc.on("close", (code) => {
      if (code == null) {
        return;
      }
      clearTimeout(timeoutRef);
      if (code === 0 && shutdownStart) {
        resolve(Date.now() - shutdownStart);
      } else {
        reject(`script failed with exit code: ${code}\n${err}`);
      }
    });
  });
}

test("unref idle connections", async () => {
  const shutdownTime = await timeScriptShutdown(
    `delete global.crypto;

    const {createClient} = require('./dist/index.node');

(async () => {
  const client = createClient(${JSON.stringify(getConnectOptions())});

  await client.query('select 1');

  await client.execute('select 1');

  await client.query('invalid query').catch(() => {});

  await client.execute('invalid query').catch(() => {});

  console.log('done');
})();`,
  );

  expect(shutdownTime).toBeLessThan(100);
}, 10_000);

test("client close", async () => {
  const client = getClient({ concurrency: 5 });

  const closeTrigger = new Event();

  const promises: Promise<void>[] = [];

  let attemptCount = 0;
  for (let i = 0; i < 10; i++) {
    let localAttemptCount = 0;
    const query = client.transaction(async (tx) => {
      attemptCount++;
      localAttemptCount++;
      if (attemptCount === 5) {
        closeTrigger.set();
      }
      await sleep(100);
      if (localAttemptCount === 1) {
        throw new TransactionConflictError();
      }
      return tx.querySingle(`select 123`);
    });
    promises.push(
      i < 5
        ? expect(query).resolves.toBe(123)
        : expect(query).rejects.toThrow(InterfaceError),
    );
  }

  await closeTrigger.wait();

  expect(attemptCount).toBe(5);

  const closePromise = client.close();

  // connections are not closed immediately
  expect(
    // @ts-ignore
    client.pool._getStats().openConnections,
  ).toBe(5);

  let resolvedLast: string | null = null;
  await Promise.all([
    closePromise.then(() => (resolvedLast = "close")),
    Promise.all(promises).then(() => (resolvedLast = "queries")),
  ]);

  expect(resolvedLast).toBe("close");

  // running queries were allowed to retry after client.close()
  expect(attemptCount).toBe(10);

  // connections were closed after retries were done
  expect(
    // @ts-ignore
    client.pool._getStats().openConnections,
  ).toBe(0);

  await expect(client.query(`select 123`)).rejects.toThrow(
    "The client is closed",
  );
});

test("client terminate", async () => {
  const client = getClient({ concurrency: 5 });

  const closeTrigger = new Event();

  const promises: Promise<void>[] = [];

  let attemptCount = 0;
  for (let i = 0; i < 10; i++) {
    let localAttemptCount = 0;
    const query = client.transaction(async (tx) => {
      attemptCount++;
      localAttemptCount++;
      if (attemptCount === 5) {
        closeTrigger.set();
      }
      await sleep(100);
      if (localAttemptCount === 1) {
        throw new TransactionConflictError();
      }
      return tx.querySingle(`select 123`);
    });
    promises.push(expect(query).rejects.toThrow(InterfaceError));
  }

  await closeTrigger.wait();

  expect(attemptCount).toBe(5);

  client.terminate();

  // connections closed immediately
  expect(
    // @ts-ignore
    client.pool._getStats().openConnections,
  ).toBe(0);

  await Promise.all(promises);

  // no retries were allowed after client.terminate()
  expect(attemptCount).toBe(5);

  await expect(client.query(`select 123`)).rejects.toThrow(
    "The client is closed",
  );
});
