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

import { getClient } from "./testbase";

test("pool.query: basic scalars", async () => {
  const pool = getClient();
  let res: any;

  try {
    res = await pool.query("select {'a', 'bc'}");
    expect(res).toEqual(["a", "bc"]);

    res = await pool.querySingle(
      `select [
          -1,
          1,
          0,
          15,
          281474976710656,
          22,
          -11111,
          346456723423,
          -346456723423,
          2251799813685125,
          -2251799813685125
        ];
        `,
    );
    expect(res).toEqual([
      -1, 1, 0, 15, 281474976710656, 22, -11111, 346456723423, -346456723423,
      2251799813685125, -2251799813685125,
    ]);
  } finally {
    await pool.close();
  }
});

test("pool.queryJSON", async () => {
  const pool = getClient();
  try {
    const res = await pool.queryJSON("select {(a := 1), (a := 2)}");
    expect(JSON.parse(res)).toEqual([{ a: 1 }, { a: 2 }]);
  } finally {
    await pool.close();
  }
});

test("pool.querySingle", async () => {
  const pool = getClient();
  try {
    let res;

    res = await pool.querySingle("select 100");
    expect(res).toBe(100);

    res = await pool.querySingle("select 'Charlie Brown'");
    expect(res).toBe("Charlie Brown");
  } finally {
    await pool.close();
  }
});

test("pool.querySingleJSON", async () => {
  const pool = getClient();
  try {
    let res;

    res = await pool.querySingleJSON("select (a := 1)");
    expect(JSON.parse(res)).toEqual({ a: 1 });

    res = await pool.querySingleJSON("select (a := 1n)");
    expect(JSON.parse(res)).toEqual({ a: 1 });
    expect(typeof JSON.parse(res).a).toEqual("number");

    res = await pool.querySingleJSON("select (a := 1.5n)");
    expect(JSON.parse(res)).toEqual({ a: 1.5 });
    expect(typeof JSON.parse(res).a).toEqual("number");
  } finally {
    await pool.close();
  }
});

test("createPool.querySingle", async () => {
  const pool = getClient();
  let res;

  try {
    res = await pool.querySingle("select 100");
    expect(res).toBe(100);

    res = await pool.querySingle("select 'Charlie Brown'");
    expect(res).toBe("Charlie Brown");
  } finally {
    await pool.close();
  }
});

test("pool retry works", async () => {
  const pool = getClient();

  try {
    const result = await pool.transaction(async (tx) => {
      return await tx.querySingle(`SELECT 33*21`);
    });
    expect(result).toEqual(693);
  } finally {
    await pool.close();
  }
});
