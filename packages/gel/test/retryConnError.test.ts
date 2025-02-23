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

import type { TLSSocket } from "node:tls";

interface PatchedTLSSocket extends TLSSocket {
  abortOnMessageType: number | null;
  abortOnNextMessageType(messageType: number): void;
}

let currentSocket: PatchedTLSSocket | null = null;

jest.mock("node:tls", () => {
  const actualTls = jest.requireActual("node:tls");

  function patchTlsSocket(_socket: TLSSocket) {
    const socket = _socket as PatchedTLSSocket;
    socket.abortOnMessageType = null;
    socket.abortOnNextMessageType = function (messageType: number) {
      this.abortOnMessageType = messageType;
    };
    const oldOnHandler = socket.on.bind(socket);
    socket.on = function (event: string, listener: (...args: any[]) => void) {
      const wrappedListener =
        event === "data"
          ? (...args: any[]) => {
              const data = args[0] as Buffer;
              let i = 0;
              while (i < data.length) {
                const messageType = data[i];
                if (messageType === this.abortOnMessageType) {
                  this.destroy();
                  break;
                } else {
                  const len = data.readUInt32BE(i + 1) + 1;
                  listener(data.slice(i, i + len), ...args.slice(1));
                  i += len;
                }
              }
            }
          : listener;

      return oldOnHandler(event, wrappedListener);
    };
    return socket;
  }

  return {
    ...actualTls,
    connect(...args: any[]) {
      const socket = patchTlsSocket(actualTls.connect(...args));
      currentSocket = socket;
      return socket;
    },
  };
});

import { getClient } from "./testbase";
import * as chars from "../src/primitives/chars";
import { sleep } from "../src/utils";

test("transaction retry on connection error after start", async () => {
  const client = getClient({ concurrency: 1 });

  let retryCount = 0;
  const result = await client.transaction(async (tx) => {
    retryCount++;

    if (retryCount === 1) {
      currentSocket!.destroy();
    }

    return await tx.querySingle(`select 'Hello Gel!'`);
  });

  expect(result).toBe("Hello Gel!");
  expect(retryCount).toBe(2);

  await client.close();
});

test("transaction retry on connection error before commit", async () => {
  const client = getClient({ concurrency: 1 });

  let retryCount = 0;
  const result = await client.transaction(async (tx) => {
    retryCount++;

    const result = await tx.querySingle(`select 'Hello Gel!'`);

    if (retryCount === 1) {
      currentSocket!.destroy();
      await sleep(0);
    }

    return result;
  });

  expect(result).toBe("Hello Gel!");
  expect(retryCount).toBe(2);

  await client.close();
});

test("transaction retry on connection error after commit", async () => {
  const client = getClient({ concurrency: 1 });

  let retryCount = 0;
  await expect(
    client.transaction(async (tx) => {
      retryCount++;

      const result = await tx.querySingle(`select 'Hello Gel!'`);

      if (retryCount === 1) {
        // abort connection on CommandComplete message from 'COMMIT'
        currentSocket!.abortOnNextMessageType(chars.$C);
      }

      return result;
    }),
  ).rejects.toThrow();

  // did not retry failed commit
  expect(retryCount).toBe(1);

  await client.close();
});

test("retry readonly queries: complete fetch", async () => {
  const client = getClient({ concurrency: 1 });

  const nonRetryingClient = client.withRetryOptions({ attempts: 1 });

  await client.ensureConnected();

  // readonly queries

  // complete fetch - retrying
  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(client.querySingle(`select 'Hello Gel!'`)).resolves.toBe(
    "Hello Gel!",
  );

  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(
    nonRetryingClient.query(`select 'Hello gel-js!'`),
  ).rejects.toThrow();
});

test("retry readonly queries: optimistic fetch", async () => {
  const client = getClient({ concurrency: 1 });

  const nonRetryingClient = client.withRetryOptions({ attempts: 1 });

  await client.ensureConnected();

  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(client.querySingle(`select 'Hello Gel!'`)).resolves.toBe(
    "Hello Gel!",
  );

  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(
    nonRetryingClient.querySingle(`select 'Hello Gel!'`),
  ).rejects.toThrow();

  await client.close();
});

test("non readonly queries: optimistic fetch", async () => {
  const client = getClient({ concurrency: 1 });

  await client.ensureConnected();

  // non readonly queries

  await client.execute(`
    create type RetryConnErrorTest {
      create property prop -> std::str;
    };
  `);

  const insertQuery = `
    insert RetryConnErrorTest {
      prop := 'test'
    }`;

  const insertResult = await client.querySingle<any>(insertQuery);
  expect(insertResult != null).toBe(true);

  // optimistic fetch
  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(client.query(insertQuery)).rejects.toThrow();

  // last query didn't retry so manually reconnect now, so currentSocket is
  // up to date
  await client.ensureConnected();

  // complete fetch
  currentSocket!.abortOnNextMessageType(chars.$D);
  await expect(
    client.query(`insert RetryConnErrorTest {
      prop := 'test2'
    }`),
  ).rejects.toThrow();

  // above inserts were aborted as data was being returned and are not
  // readonly, so each should have only been executed once and not retried
  expect(
    await client.querySingle(`select count((select RetryConnErrorTest))`),
  ).toBe(3);

  await client.close();
}, 15_000);
