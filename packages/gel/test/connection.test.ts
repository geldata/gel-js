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

import { type Client } from "../src/index.node";
import { getClient } from "./testbase";
import * as errors from "../src/errors";

test("connect: timeout", async () => {
  let client: Client | undefined;
  try {
    client = await getClient({
      timeout: 1,
      waitUntilAvailable: 0,
    }).ensureConnected();
    throw new Error("connection didn't time out");
  } catch (e: any) {
    expect(e).toBeInstanceOf(errors.ClientConnectionTimeoutError);
    expect(e.message).toMatch("connection timed out (1ms)");
  } finally {
    if (typeof client !== "undefined") {
      await client.close();
    }
  }
});

test("connect: refused", async () => {
  let client: Client | undefined;
  try {
    client = await getClient({
      host: "localhost",
      port: 23456,
      waitUntilAvailable: 0,
    }).ensureConnected();
    throw new Error("connection isn't refused");
  } catch (e: any) {
    expect(e).toBeInstanceOf(errors.ClientConnectionClosedError);
    expect(e.cause.code).toMatch("ECONNREFUSED");
  } finally {
    if (typeof client !== "undefined") {
      await client.close();
    }
  }
});

test("connect: invalid name", async () => {
  let client: Client | undefined;
  try {
    client = await getClient({
      host: "invalid.example.org",
      port: 23456,
      waitUntilAvailable: 0,
    }).ensureConnected();
    throw new Error("name was resolved");
  } catch (e: any) {
    expect(e).toBeInstanceOf(errors.ClientConnectionClosedError);
    expect(e.cause.code).toMatch("ENOTFOUND");
    expect(e.cause.syscall).toMatch("getaddrinfo");
  } finally {
    if (typeof client !== "undefined") {
      await client.close();
    }
  }
});

test("connect: refused unix", async () => {
  let client: Client | undefined;
  try {
    client = await getClient({
      host: "/tmp/non-existent",
      waitUntilAvailable: 0,
    }).ensureConnected();
    throw new Error("connection isn't refused");
  } catch (e: any) {
    expect(e.message).toEqual("unix socket paths not supported");
  } finally {
    if (typeof client !== "undefined") {
      await client.close();
    }
  }
});
