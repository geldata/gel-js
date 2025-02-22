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

import * as errors from "../src/errors";
import { type Client } from "../src/index.node";
import { defaultBackoff, RetryOptions } from "../src/options";
import { getClient } from "./testbase";

class Barrier {
  _counter: number;
  _waiters: (() => void)[];
  constructor(counter: number) {
    this._counter = counter;
    this._waiters = [];
  }
  async ready() {
    if (this._counter == 0) {
      return;
    }
    this._counter -= 1;
    if (this._counter == 0) {
      for (const waiter of this._waiters.splice(0, this._waiters.length)) {
        waiter();
      }
    } else {
      await new Promise<void>((accept) => {
        this._waiters.push(accept);
      });
    }
  }
}

const typename = "RetryTest";

async function run(test: (client: Client) => Promise<void>): Promise<void> {
  const client = getClient();

  try {
    await test(client);
  } finally {
    await client.close();
  }
}

async function run2(
  test: (con1: Client, con2: Client) => Promise<void>,
): Promise<void> {
  const connection = getClient();
  try {
    const connection2 = getClient();
    try {
      await test(connection, connection2);
    } finally {
      try {
        await connection2.close();
      } catch (e) {
        console.error("Error closing connection", e);
      }
    }
  } finally {
    try {
      await connection.close();
    } catch (e) {
      console.error("Error closing connection", e);
    }
  }
}

beforeAll(async () => {
  await run(async (con) => {
    await con.execute(`
      CREATE TYPE ${typename} EXTENDING std::Object {
        CREATE PROPERTY name -> std::str {
          CREATE CONSTRAINT std::exclusive;
        };
        CREATE PROPERTY value -> std::int32 {
          SET default := 0;
        };
      };
    `);
  });
}, 50_000);

afterAll(async () => {
  await run(async (con) => {
    await con.execute(`DROP TYPE ${typename};`);
  });
}, 50_000);

test("retry: regular 01", async () => {
  await run(async (con) => {
    await con.transaction(async (tx) => {
      await tx.execute(`
        INSERT ${typename} {
          name := 'counter1'
        };
      `);
    });
  });
});

async function checkRetries(client: Client, client2: Client, name: string) {
  let iterations = 0;
  const barrier = new Barrier(2);

  async function transaction(client: Client): Promise<unknown> {
    return await client.transaction(async (tx) => {
      iterations += 1;

      // This magic query makes the test more reliable for some
      // reason. I guess this is because starting a transaction
      // in Gel (and/or Postgres) is accomplished somewhat
      // lazily, i.e. only start transaction on the first query
      // rather than on the `START TRANSACTION`.
      await tx.query(`SELECT 1`);

      // Start both transactions at the same initial data.
      // One should succeed other should fail and retry.
      // On next attempt, the latter should succeed
      await barrier.ready();

      return await tx.querySingle(
        `
        SELECT (
          INSERT ${typename} {
            name := <str>$name,
            value := 1,
          } UNLESS CONFLICT ON .name
          ELSE (
            UPDATE ${typename}
            SET { value := .value + 1 }
          )
        ).value
      `,
        { name },
      );
    });
  }

  const results = await Promise.all([
    transaction(client),
    transaction(client2),
  ]);
  results.sort();
  expect(results).toEqual([1, 2]);
  expect(iterations).toEqual(3);
}

test("retry: conflict", async () => {
  await run2(async (con, con2) => {
    await checkRetries(con, con2, "counter2");
  });
});

test("retry: conflict no retry", async () => {
  await expect(
    run2(async (con, con2) => {
      const opt = new RetryOptions(1, defaultBackoff); // class api
      await checkRetries(
        con.withRetryOptions(opt),
        con2.withRetryOptions(opt),
        "counter3",
      );
    }),
  ).rejects.toBeInstanceOf(errors.TransactionSerializationError);

  await expect(
    run2(async (con, con2) => {
      const opt = { attempts: 1 }; // obj api
      await checkRetries(
        con.withRetryOptions(opt),
        con2.withRetryOptions(opt),
        "counter4",
      );
    }),
  ).rejects.toBeInstanceOf(errors.TransactionSerializationError);
});

test("retry attempts", async () => {
  const client = getClient().withRetryOptions({ attempts: 5 });

  let counter = 0;

  try {
    await client.transaction(() => {
      counter++;

      throw new errors.TransactionConflictError();
    });
  } catch {
    /* empty catch */
  }

  expect(counter).toBe(5);

  await client.close();
});
