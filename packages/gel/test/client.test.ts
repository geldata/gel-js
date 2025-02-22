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

import {
  expect,
  test,
  describe,
  beforeAll,
  afterAll,
  it,
  jest,
} from "@jest/globals";
import fc from "fast-check";
import { parseConnectArguments } from "../src/conUtils.server";
import type { Executor, _ICodec, Codecs } from "../src/index.node";
import {
  DivisionByZeroError,
  Duration,
  GelError,
  LocalDate,
  LocalDateTime,
  Range,
  MultiRange,
  MissingRequiredError,
  NoDataError,
  RelativeDuration,
  ResultCardinalityMismatchError,
  QueryArgumentError,
  _CodecsRegistry,
  _ReadBuffer,
  Options,
  AuthenticationError,
  InvalidReferenceError,
  throwWarnings,
  Float16Array,
  InvalidArgumentError,
  InvalidValueError,
  SparseVector,
  UnsupportedFeatureError,
} from "../src/index.node";

import { AdminUIFetchConnection } from "../src/fetchConn";
import { NOOP_CODEC_CONTEXT, CodecValueType } from "../src/codecs/context";
import {
  getAvailableExtensions,
  getAvailableFeatures,
  getClient,
  getConnectOptions,
  getGelVersion,
} from "./testbase";
import { PG_VECTOR_MAX_DIM } from "../src/codecs/pgvector";
import { getHTTPSCRAMAuth } from "../src/httpScram";
import cryptoUtils from "../src/cryptoUtils";
import { getAuthenticatedFetch } from "../src/utils";
import { Language } from "../src/ifaces";

class CancelTransaction extends Error {}

test("query: basic scalars", async () => {
  const con = getClient();
  try {
    const resMulti: string[] = await con.query("select {'a', 'bc'}");
    expect(resMulti).toEqual(["a", "bc"]);

    const resRequired: [string, ...string[]] =
      await con.queryRequired("select {'a', 'bc'}");
    expect(resRequired).toEqual(["a", "bc"]);

    const resSingle: number[] | null = await con.querySingle(
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
    expect(resSingle).toEqual([
      -1, 1, 0, 15, 281474976710656, 22, -11111, 346456723423, -346456723423,
      2251799813685125, -2251799813685125,
    ]);

    const resInt32: number[] = await con.query(
      "select <int32>{-1, 0, 1, 10, 2147483647};",
    );
    expect(resInt32).toEqual([-1, 0, 1, 10, 2147483647]);

    const resRequiredInt32: [number, ...number[]] = await con.queryRequired(
      "select <int32>{-1, 0, 1, 10, 2147483647};",
    );
    expect(resRequiredInt32).toEqual([-1, 0, 1, 10, 2147483647]);

    const resInt16 = await con.query(
      "select <int16>{-1, 0, 1, 10, 15, 22, -1111};",
    );
    expect(resInt16).toEqual([-1, 0, 1, 10, 15, 22, -1111]);

    const resRequiredInt16: [number, ...number[]] = await con.queryRequired(
      "select <int16>{-1, 0, 1, 10, 15, 22, -1111};",
    );
    expect(resRequiredInt16).toEqual([-1, 0, 1, 10, 15, 22, -1111]);

    const resBool: boolean[] = await con.query(
      "select {true, false, false, true, false};",
    );
    expect(resBool).toEqual([true, false, false, true, false]);

    const resRequiredBool: [boolean, ...boolean[]] = await con.queryRequired(
      "select {true, false, false, true, false};",
    );
    expect(resRequiredBool).toEqual([true, false, false, true, false]);

    const resSingleFloat64: number[] | null = await con.querySingle(
      "select [<float64>123.2, <float64>-1.1]",
    );
    expect(resSingleFloat64![0]).toBeCloseTo(123.2, 2);
    expect(resSingleFloat64![1]).toBeCloseTo(-1.1, 2);

    const resSingleFloat32: number[] | null = await con.querySingle(
      "select [<float32>123.2, <float32>-1.1]",
    );
    expect(resSingleFloat32![0]).toBeCloseTo(123.2, 2);
    expect(resSingleFloat32![1]).toBeCloseTo(-1.1, 2);

    const resSingleBytes: Uint8Array | null =
      await con.querySingle("select b'abcdef'");
    expect(resSingleBytes instanceof Uint8Array).toBeTruthy();
    expect(resSingleBytes).toEqual(new TextEncoder().encode("abcdef"));

    const resSingleJSON: string | null = await con.querySingle(
      "select <json>[1, 2, 3]",
    );
    expect(resSingleJSON).toEqual([1, 2, 3]);
  } finally {
    await con.close();
  }
});

test("fetch: bigint", async () => {
  const con = getClient();
  let res: any;
  try {
    const testar = [
      BigInt("0"),
      BigInt("-0"),
      BigInt("+0"),
      BigInt("1"),
      BigInt("-1"),
      BigInt("123"),
      BigInt("-123"),
      BigInt("123789"),
      BigInt("-123789"),
      BigInt("19876"),
      BigInt("-19876"),
      BigInt("19876"),
      BigInt("-19876"),
      BigInt("198761239812739812739801279371289371932"),
      BigInt("-198761182763908473812974620938742386"),
      BigInt("98761239812739812739801279371289371932"),
      BigInt("-98761182763908473812974620938742386"),
      BigInt("8761239812739812739801279371289371932"),
      BigInt("-8761182763908473812974620938742386"),
      BigInt("761239812739812739801279371289371932"),
      BigInt("-761182763908473812974620938742386"),
      BigInt("61239812739812739801279371289371932"),
      BigInt("-61182763908473812974620938742386"),
      BigInt("1239812739812739801279371289371932"),
      BigInt("-1182763908473812974620938742386"),
      BigInt("9812739812739801279371289371932"),
      BigInt("-3908473812974620938742386"),
      BigInt("98127373373209"),
      BigInt("-4620938742386"),
      BigInt("100000000000"),
      BigInt("-100000000000"),
      BigInt("10000000000"),
      BigInt("-10000000000"),
      BigInt("1000000000"),
      BigInt("-1000000000"),
      BigInt("100000000"),
      BigInt("-100000000"),
      BigInt("10000000"),
      BigInt("-10000000"),
      BigInt("1000000"),
      BigInt("-1000000"),
      BigInt("100000"),
      BigInt("-100000"),
      BigInt("10000"),
      BigInt("-10000"),
      BigInt("1000"),
      BigInt("-1000"),
      BigInt("100"),
      BigInt("-100"),
      BigInt("10"),
      BigInt("-10"),
      BigInt("100030000010"),
      BigInt("-100000600004"),
      BigInt("10000000100"),
      BigInt("-10030000000"),
      BigInt("1000040000"),
      BigInt("-1000000000"),
      BigInt("1010000001"),
      BigInt("-1000000001"),
      BigInt("1001001000"),
      BigInt("-10000099"),
      BigInt("99999"),
      BigInt("9999"),
      BigInt("999"),
      BigInt("1011"),
      BigInt("1009"),
      BigInt("1709"),
    ];

    // Generate random bigints
    for (let i = 0; i < 1000; i++) {
      const len = Math.floor(Math.random() * 30) + 1;
      let num = "";
      for (let j = 0; j < len; j++) {
        num += "0123456789"[Math.floor(Math.random() * 10)];
      }
      testar.push(BigInt(num));
    }

    // Generate more random bigints consisting from mostly 0s
    for (let i = 0; i < 1000; i++) {
      const len = Math.floor(Math.random() * 50) + 1;
      let num = "";
      for (let j = 0; j < len; j++) {
        num += "0000000012"[Math.floor(Math.random() * 10)];
      }
      testar.push(BigInt(num));
    }

    res = await con.querySingle("select <array<bigint>>$0", [testar]);
    expect(res).toEqual(testar);
  } finally {
    await con.close();
  }
});

test("fetch: decimal as string", async () => {
  const con = getClient();

  const vals = [
    "0.001",
    "0.001000",
    "1.0",
    "1.00000",
    "0.00000000000000",
    "1.00000000000000",
    "-1.00000000000000",
    "-2.00000000000000",
    "1000000000000000.00000000000000",
    "1234000000.00088883231",
    "1234.00088883231",
    "3123.23111",
    "-3123000000.23111",
    "3123.2311100000",
    "-03123.0023111",
    "3123.23111",
    "3123.23111",
    "10000.23111",
    "100000.23111",
    "1000000.23111",
    "10000000.23111",
    "100000000.23111",
    "1000000000.23111",
    "1000000000.3111",
    "1000000000.111",
    "1000000000.11",
    "100000000.0",
    "10000000.0",
    "1000000.0",
    "100000.0",
    "10000.0",
    "1000.0",
    "100.0",
    "100",
    "100.1",
    "100.12",
    "100.123",
    "100.1234",
    "100.12345",
    "100.123456",
    "100.1234567",
    "100.12345679",
    "100.123456790",
    "100.123456790000000000000000",
    "1.0",
    "0.0",
    "-1.0",
    "1.0E-1000",
    "1E1000",
    "0.000000000000000000000000001",
    "0.000000000000010000000000001",
    "0.00000000000000000000000001",
    "0.00000000100000000000000001",
    "0.0000000000000000000000001",
    "0.000000000000000000000001",
    "0.00000000000000000000001",
    "0.0000000000000000000001",
    "0.000000000000000000001",
    "0.00000000000000000001",
    "0.0000000000000000001",
    "0.000000000000000001",
    "0.00000000000000001",
    "0.0000000000000001",
    "0.000000000000001",
    "0.00000000000001",
    "0.0000000000001",
    "0.000000000001",
    "0.00000000001",
    "0.0000000001",
    "0.000000001",
    "0.00000001",
    "0.0000001",
    "0.000001",
    "0.00001",
    "0.0001",
    "0.001",
    "0.01",
    "0.1",
    "-0.000000001",
    "-0.00000001",
    "-0.0000001",
    "-0.000001",
    "-0.00001",
    "-0.0001",
    "-0.001",
    "-0.01",
    "-0.1",
    "0.10",
    "0.100",
    "0.1000",
    "0.10000",
    "0.100000",
    "0.00001000",
    "0.000010000",
    "0.0000100000",
    "0.00001000000",
    "-0.10",
    "-0.100",
    "-0.1000",
    "-0.10000",
    "-0.100000",
    "-0.00001000",
    "-0.000010000",
    "-0.0000100000",
    "-0.00001000000",
    "1" + "0".repeat(117) + "." + "0".repeat(161),
  ];

  try {
    const fetched = await con.querySingle<any>(
      `
      WITH
        inp := <array<decimal>>$0,
        inpStr := <array<str>>$1,
        str := <array<str>>inp,
      SELECT
        (inp, str, <array<decimal>>inpStr)
    `,
      [vals, vals],
    );

    expect(fetched[0].length).toBe(vals.length);
    for (let i = 0; i < fetched[0].length; i++) {
      expect(fetched[0][i]).toBe(fetched[2][i]);
      expect(fetched[0][i]).toBe(fetched[1][i]);
    }
  } finally {
    await con.close();
  }
});

const pgvectorVersion = getAvailableExtensions().get("pgvector");

if (pgvectorVersion != null) {
  describe("fetch: ext::pgvector::vector", () => {
    const con = getClient();

    beforeAll(async () => {
      await con.execute("create extension pgvector;");
    });

    afterAll(async () => {
      await con.execute("drop extension pgvector;");
      await con.close();
    });

    test("valid: Float32Array", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float32Array({
            noNaN: true,
            noDefaultInfinity: true,
            minLength: 1,
            maxLength: PG_VECTOR_MAX_DIM,
          }),
          async (data) => {
            const result = await con.querySingle<unknown[]>(
              "select (<ext::pgvector::vector>$0, <ext::pgvector::vector>$1)",
              [data, [...data]],
            );
            expect(Array.isArray(result)).toBe(true);
            expect(result!.length).toBe(2);
            expect(result![0]).toBeInstanceOf(Float32Array);
            expect(result![1]).toBeInstanceOf(Float32Array);
            expect(result![0]).toEqual(data);
            expect(result![1]).toEqual(data);
          },
        ),
        { numRuns: 1000 },
      );
    });

    test("valid: JSON", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float32Array({
            noNaN: true,
            noDefaultInfinity: true,
            minLength: 1,
            maxLength: PG_VECTOR_MAX_DIM,
          }),
          async (data) => {
            const result = await con.querySingle<number[]>(
              "select <json><ext::pgvector::vector>$0;",
              [data],
            );
            const f32JsonResult = new Float32Array(result!);
            const f32JsonData = new Float32Array(
              JSON.parse(JSON.stringify(Array.from(data))),
            );
            expect(f32JsonResult).toEqual(f32JsonData);
          },
        ),
        { numRuns: 1000 },
      );
    });

    test("invalid: empty", async () => {
      const data = new Float32Array([]);
      await expect(
        con.querySingle("select <ext::pgvector::vector>$0;", [data]),
      ).rejects.toThrow();
    });

    test("invalid: invalid argument", async () => {
      await expect(
        con.querySingle("select <ext::pgvector::vector>$0;", ["foo"]),
      ).rejects.toThrow();
    });
  });
}

if (
  pgvectorVersion != null &&
  (pgvectorVersion.major > 0 || pgvectorVersion.minor >= 7)
) {
  describe("fetch: ext::pgvector::halfvec", () => {
    const con = getClient();

    beforeAll(async () => {
      await con.execute("create extension pgvector;");
    });

    afterAll(async () => {
      await con.execute("drop extension pgvector;");
      await con.close();
    });

    test("valid: Float16Array", async () => {
      const val = await con.queryRequiredSingle<Float16Array>(
        `
    select <ext::pgvector::halfvec>
        [1.5, 2.0, 3.8, 0, 3.4575e-3, 65000,
         6.0975e-5, 2.2345e-7, -5.96e-8]
    `,
      );

      expect(val).toBeInstanceOf(Float16Array);
      expect(val[0]).toEqual(1.5);
      expect(val[1]).toEqual(2);
      expect(val[2]).toBeCloseTo(3.8, 2);
      expect(val[3]).toEqual(0);
      expect(val[4]).toBeCloseTo(3.457e-3, 2);
      expect(val[5]).toEqual(64992);
      // These values are sub-normal so they don't map perfectly onto f32
      expect(val[6]).toBeCloseTo(6.0975e-5, 2);
      expect(val[7]).toBeCloseTo(2.38e-7, 2);
      expect(val[8]).toBeCloseTo(-5.96e-8, 2);
    });

    test("valid: Float16Array arg", async () => {
      const val = await con.queryRequiredSingle<number[]>(
        `select <array<float32>><ext::pgvector::halfvec>$0`,
        [
          new Float16Array([
            1.5, 2.0, 3.8, 0, 3.4575e-3, 65000, 6.0975e-5, 2.385e-7, -5.97e-8,
          ]),
        ],
      );

      expect(val[0]).toEqual(1.5);
      expect(val[1]).toEqual(2);
      expect(val[2]).toBeCloseTo(3.8, 2);
      expect(val[3]).toEqual(0);
      expect(val[4]).toBeCloseTo(3.457e-3, 2);
      expect(val[5]).toEqual(64992);
      // These values are sub-normal so they don't map perfectly onto f32
      expect(val[6]).toBeCloseTo(6.0975e-5, 2);
      expect(val[7]).toBeCloseTo(2.38e-7, 2);
      expect(val[8]).toBeCloseTo(-5.96e-8, 2);
    });

    test("valid: number[] arg", async () => {
      await expect(
        con.queryRequiredSingle<boolean>(
          `select <ext::pgvector::halfvec>$0 = <ext::pgvector::halfvec>$1`,
          [
            new Float16Array([
              1.5, 2.0, 3.8, 0, 3.4575e-3, 65000, 6.0975e-5, 2.385e-7, -5.97e-8,
            ]),
            [1.5, 2.0, 3.8, 0, 3.4575e-3, 65000, 6.0975e-5, 2.385e-7, -5.97e-8],
          ],
        ),
      ).resolves.toBe(true);
    });

    test("invalid: invalid args", async () => {
      await expect(
        con.querySingle(`select <ext::pgvector::halfvec>$0`, [
          [3.0, null, -42.5],
        ]),
      ).rejects.toThrow(InvalidArgumentError);

      await expect(
        con.querySingle(`select <ext::pgvector::halfvec>$0`, [
          [3.0, "x", -42.5],
        ]),
      ).rejects.toThrow(InvalidArgumentError);

      await expect(
        con.querySingle(`select <ext::pgvector::halfvec>$0`, ["foo"]),
      ).rejects.toThrow(InvalidArgumentError);

      await expect(
        con.querySingle(`select <ext::pgvector::halfvec>$0`, [[1_000_000]]),
      ).rejects.toThrow(InvalidValueError);
    });
  });

  describe("fetch: ext::pgvector::sparsevec", () => {
    const con = getClient();

    beforeAll(async () => {
      await con.execute("create extension pgvector;");
    });

    afterAll(async () => {
      await con.execute("drop extension pgvector;");

      await con.close();
    });

    test("valid: SparseVector methods", async () => {
      const sparseVec = new SparseVector(7, { 1: 1.5, 2: 2, 4: 3.8 });

      const arr: number[] = [];
      let i = 0;
      for (const val of sparseVec) {
        expect(val).toEqual(sparseVec[i++]);
        arr.push(val);
      }
      expect(arr).toEqual([...new Float32Array([0, 1.5, 2, 0, 3.8, 0, 0])]);
      expect(arr).toEqual([...sparseVec]);
    });

    test("valid: SparseVector", async () => {
      const val = await con.queryRequiredSingle<SparseVector>(
        `
      select <ext::pgvector::sparsevec>
          <ext::pgvector::vector>[0, 1.5, 2.0, 3.8, 0, 0]
      `,
      );

      expect(val).toBeInstanceOf(SparseVector);
      expect(val.length).toEqual(6);
      expect(val[1]).toEqual(1.5);
      expect(val[2]).toEqual(2);
      expect(val[3]).toBeCloseTo(3.8, 6);
      expect(val[4]).toEqual(0);
    });

    test("valid: SparseVector arg", async () => {
      const val = await con.queryRequiredSingle<Float32Array>(
        `
      select <ext::pgvector::vector>
          <ext::pgvector::sparsevec>$0
      `,
        [new SparseVector(6, { 1: 1.5, 2: 2, 4: 3.8 })],
      );

      expect(val).toEqual(new Float32Array([0, 1.5, 2, 0, 3.8, 0]));
    });

    test("invalid: invalid args", async () => {
      expect(() => new SparseVector(1, { 1: 1.5, 2: 2, 3: 3.8 })).toThrow(
        `length of data cannot be larger than length of sparse vector`,
      );

      expect(() => new SparseVector(6, { 1: 1.5, 2: 2, 6: 3.8 })).toThrow(
        `index 6 is out of range of sparse vector length`,
      );

      expect(
        () =>
          // @ts-expect-error
          new SparseVector(6, { 1: 1.5, 2: 2, 3: "3.8" }),
      ).toThrow(`expected value at index 3 to be number, got string 3.8`);

      expect(
        () =>
          // @ts-expect-error
          new SparseVector(6, { 1: 1.5, 2: 2, x: 3.8 }),
      ).toThrow(`key x in data map is not an integer`);

      expect(() => new SparseVector(6, { 1: 1.5, 2: 2, 3: 0 })).toThrow(
        `elements in sparse vector cannot be 0`,
      );
    });
  });
}

test("fetch: positional args", async () => {
  const con = getClient();
  let res: any;
  try {
    const intCases: Array<[string[], number[]]> = [
      [
        ["int16", "int32", "int64"],
        [1, 1111],
      ],
      [
        ["int16", "int32", "int64"],
        [100, -101],
      ],
      [
        ["int16", "int32", "int64"],
        [10011, 0],
      ],
      [["int64"], [17592186032104, -4398037227340]],
      [
        ["float32", "float64"],
        [10011, 12312],
      ],
    ];
    for (const [types, values] of intCases) {
      for (const type of types) {
        res = await con.querySingle(
          `select (<${type}>$0 + <${type}>$1,);`,
          values,
        );
        expect(res[0]).toBe(values[0] + values[1]);
      }
    }

    res = await con.querySingle(`select <json>$0`, [[1, 2]]);
    expect(res).toEqual([1, 2]);

    res = await con.querySingle(`select <str>$0`, ["[1,2]"]);
    expect(res).toBe("[1,2]");

    res = await con.querySingle(`select (<bool>$0, <bool>$1)`, [true, false]);
    expect(res).toEqual([true, false]);

    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, -12312);
    res = await con.querySingle(`select <bytes>$0`, [bytes]);
    expect(res).toEqual(bytes);

    const dt = new Date(Date.now());
    res = await con.querySingle(`select <datetime>$0`, [dt]);
    expect(res).toEqual(dt);
    res = await con.querySingle(`select [<datetime>$0, <datetime>$0]`, [dt]);
    expect(res).toEqual([dt, dt]);

    const ldt = new LocalDateTime(2012, 6, 30, 14, 11, 33, 123, 456);
    res = await con.querySingle(`select <cal::local_datetime>$0`, [ldt]);
    expect(res instanceof LocalDateTime).toBeTruthy();
    expect((res as LocalDateTime).hour).toBe(14);
    expect((res as LocalDateTime).toString()).toBe(
      "2012-06-30T14:11:33.123456",
    );

    res = await con.querySingle(`select len(<array<int64>>$0)`, [
      [1, 2, 3, 4, 5],
    ]);
    expect(res).toEqual(5);
  } finally {
    await con.close();
  }
});

test("fetch: named args", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`select <str>$a`, { a: "123" });
    expect(res).toBe("123");

    res = await con.querySingle(`select <str>$a ++ <str>$b`, {
      b: "abc",
      a: "123",
    });
    expect(res).toBe("123abc");

    res = await con
      .querySingle(`select <str>$a ++ <str>$b`, {
        b: "abc",
        a: "123",
        c: "def",
      })
      .then(() => {
        throw new Error(
          "there should have been an unexpected named argument error",
        );
      })
      .catch((e) => {
        expect(e.toString()).toMatch(/Unused named argument: "c"/);
      });

    res = await con.querySingle(`select len(<OPTIONAL str>$a ?? "aa")`, {
      a: null,
    });
    expect(res).toBe(2);
  } finally {
    await con.close();
  }
});

if (getGelVersion().major >= 3) {
  test("fetch: tuples in args", async () => {
    const client = getClient();
    try {
      const tests: { [key: string]: any[] } = {
        // Basic tuples
        "tuple<str, bool>": [
          ["x", true],
          ["y", false],
        ],
        "optional tuple<str, bool>": [["x", true], null],
        // Some pointlessly nested tuples
        "tuple<tuple<str, bool>>": [[["x", true]]],
        "tuple<tuple<str, bool>, int64>": [[["x", true], 1]],
        // Basic array examples
        "array<tuple<int64, str>>": [
          [],
          [[0, "zero"]],
          [
            [0, "zero"],
            [1, "one"],
          ],
        ],
        "optional array<tuple<int64, str>>": [
          null,
          [],
          [[0, "zero"]],
          [
            [0, "zero"],
            [1, "one"],
          ],
        ],
        "array<tuple<str, array<int64>>>": [
          [],
          [["x", []]],
          [["x", [1]]],
          [
            ["x", []],
            ["y", []],
            ["z", []],
          ],
          [
            ["x", [1]],
            ["y", []],
            ["z", []],
          ],
          [
            ["x", []],
            ["y", [1]],
            ["z", []],
          ],
          [
            ["x", []],
            ["y", []],
            ["z", [1]],
          ],
          [
            ["x", []],
            ["y", [1, 2]],
            ["z", [1, 2, 3]],
          ],
        ],
        // Arrays of pointlessly nested tuples
        "array<tuple<tuple<str, bool>, int64>>": [
          [],
          [[["x", true], 1]],
          [
            [["x", true], 1],
            [["z", false], 2],
          ],
        ],
        "array<tuple<tuple<array<str>, bool>, int64>>": [
          [],
          [[[[], true], 1]],
          [
            [[["x", "y", "z"], true], 1],
            [[["z"], false], 2],
          ],
        ],
        // Named tuples
        "tuple<a: str, b: bool>": [{ a: "x", b: true }],
        "optional tuple<a: str, b: bool>": [{ a: "x", b: true }, null],
        "tuple<x: tuple<a: str, b: bool>>": [
          {
            x: { a: "x", b: true },
          },
        ],
        "tuple<x: tuple<a: str, b: bool>, y: int64>": [
          {
            x: { a: "x", b: true },
            y: 1,
          },
        ],
        "array<tuple<a: int64, b: str>>": [
          [],
          [{ a: 0, b: "zero" }],
          [
            { a: 0, b: "zero" },
            { a: 1, b: "one" },
          ],
        ],
        "optional array<tuple<a: int64, b: str>>": [
          null,
          [],
          [{ a: 0, b: "zero" }],
          [
            { a: 0, b: "zero" },
            { a: 1, b: "one" },
          ],
        ],
        "array<tuple<a: str, b: array<int64>>>": [
          [],
          [{ a: "x", b: [] }],
          [
            {
              a: "x",
              b: [1],
            },
          ],
          [
            { a: "x", b: [] },
            { a: "y", b: [] },
            { a: "z", b: [] },
          ],
          [
            {
              a: "x",
              b: [1],
            },
            { a: "y", b: [] },
            { a: "z", b: [] },
          ],
          [
            { a: "x", b: [] },
            {
              a: "y",
              b: [1],
            },
            { a: "z", b: [] },
          ],
          [
            { a: "x", b: [] },
            { a: "y", b: [] },
            {
              a: "z",
              b: [1],
            },
          ],
          [
            { a: "x", b: [] },
            {
              a: "y",
              b: [1, 2],
            },
            {
              a: "z",
              b: [1, 2, 3],
            },
          ],
        ],
      };

      for (let [cast, inputs] of Object.entries(tests)) {
        for (let input of inputs) {
          expect(
            await client.querySingle(`select <${cast}>$0`, [input]),
          ).toEqual(input);
        }
      }

      await expect(
        client.query(`select <tuple<str, int64>>$test`, {
          test: ["str", 123, 456],
        }),
      ).rejects.toThrow(/expected 2 tuple items, got 3/);

      await expect(
        client.query(`select <tuple<str, int64>>$test`, {
          test: ["str", "123"],
        }),
      ).rejects.toThrow(
        /invalid element at index 1 in tuple: a number was expected, got "123"/,
      );

      await expect(
        client.query(`select <tuple<str, int64>>$test`, {
          test: ["str", null],
        }),
      ).rejects.toThrow(/element at index 1 in tuple cannot be 'null'/);

      await expect(
        client.query(`select <tuple<a: str, b: int64>>$test`, {
          test: ["str", 123],
        }),
      ).rejects.toThrow(/an object was expected, got "str,123"/);

      await expect(
        client.query(`select <tuple<str, int64>>$test`, {
          test: { a: "str", b: 123 },
        }),
      ).rejects.toThrow(/an array was expected, got "\[object Object\]"/);

      await expect(
        client.query(`select <tuple<a: str, b: int64>>$test`, {
          test: { a: "str", b: 123, c: 456 },
        }),
      ).rejects.toThrow(/expected 2 elements in named tuple, got 3/);

      await expect(
        client.query(`select <tuple<a: str, b: int64>>$test`, {
          test: { a: "str", b: "123" },
        }),
      ).rejects.toThrow(
        /invalid element 'b' in named tuple: a number was expected, got "123"/,
      );

      await expect(
        client.query(`select <tuple<a: str, b: int64>>$test`, {
          test: { a: "str", b: null },
        }),
      ).rejects.toThrow(/element 'b' in named tuple cannot be 'null'/);
    } finally {
      await client.close();
    }
  });
}

test("fetch: int overflow", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`
      select <int64>(2^53) - 1;
    `);
    expect(res).toBe(9007199254740991);

    await con
      .querySingle(`select <int64>(2^53);`)
      .then(() => {
        throw new Error("there should have been an overflow error");
      })
      .catch((e) => {
        expect(e.toString()).toMatch(/cannot unpack.*9007199254740992.*/);
      });

    res = await con.querySingle(`
      select -<int64>(2^53);
    `);
    expect(res).toBe(-9007199254740992);

    await con
      .querySingle(`select -<int64>(2^53) - 1;`)
      .then(() => {
        throw new Error("there should have been an overflow error");
      })
      .catch((e) => {
        expect(e.toString()).toMatch(/cannot unpack.*-9007199254740993.*/);
      });
  } finally {
    await con.close();
  }
});

test("fetch: datetime", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`
      with dt := <datetime>'2016-01-10T17:11:01.123Z'
      select (dt, datetime_get(dt, 'epochseconds') * 1000)
    `);
    expect(res[0].getTime()).toBe(res[1]);

    res = await con.querySingle(`
      with dt := <datetime>'1716-01-10T01:00:00.123123Z'
      select (dt, datetime_get(dt, 'epochseconds') * 1000)
    `);
    expect(res[0].getTime()).toBe(Math.floor(res[1]));
  } finally {
    await con.close();
  }
});

test("fetch: cal::local_date", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`
      select <cal::local_date>'2016-01-10';
      `);
    expect(res instanceof LocalDate).toBeTruthy();
    expect(res.toString()).toBe("2016-01-10");

    res = await con.querySingle(
      `
      select <cal::local_date>$0;
      `,
      [res],
    );
    expect(res instanceof LocalDate).toBeTruthy();
    expect(res.toString()).toBe("2016-01-10");
  } finally {
    await con.close();
  }
});

test("fetch: cal::local_time", async () => {
  const con = getClient();
  let res: any;
  try {
    for (const time of [
      "11:12:13",
      "00:01:11.34",
      "00:00:00",
      "23:59:59.999",
    ]) {
      res = await con.querySingle(
        `
        select (<cal::local_time><str>$time, <str><cal::local_time><str>$time);
        `,
        { time },
      );
      expect(res[0].toString()).toBe(res[1]);

      const res2 = await con.querySingle<any>(
        `
        select <cal::local_time>$time;
        `,
        { time: res[0] },
      );
      expect(res2.toString()).toBe(res[0].toString());
    }
  } finally {
    await con.close();
  }
});

test("fetch: duration", async () => {
  function normaliseIsoDuration(duration: string) {
    if (duration.includes("-")) {
      return `-${duration.replace(/-/g, "")}`;
    }
    return duration;
  }

  const con = getClient();
  let res: any;
  try {
    for (const time of [
      "24 hours",
      "68464977 seconds 74 milliseconds 11 microseconds",
      "-752043.296 milliseconds",
    ]) {
      res = await con.querySingle(
        `
        select (<duration><str>$time, <str><duration><str>$time);
        `,
        { time },
      );

      expect(res[0].toString()).toBe(normaliseIsoDuration(res[1]));

      const res2 = await con.querySingle<any>(
        `
        select <duration>$time;
        `,
        { time: res[0] },
      );
      expect(res2.toString()).toBe(res[0].toString());
    }

    for (const time of [
      new Duration(1),
      new Duration(0, -1),
      new Duration(0, 0, 1, 0),
      new Duration(0, 0, 0, -1),
    ]) {
      await con
        .querySingle(`select <duration>$time`, { time })
        .then(() => {
          throw new Error("There should have encoding error");
        })
        .catch((e) => {
          expect(e.toString()).toMatch(
            /Cannot encode a 'Duration' with a non-zero number of.*/,
          );
        });
    }
  } finally {
    await con.close();
  }
});

jest.setTimeout(10_000);
test("fetch: duration fuzz", async () => {
  // @ts-ignore
  const Temporal = require("@js-temporal/polyfill").Temporal;
  const randint = (min: number, max: number) => {
    const x = Math.round(Math.random() * (max - min) + min);
    return x === -0 ? 0 : x;
  };

  const durs = [
    new Duration(),
    new Duration(0, 0, 0, 0, 0, 0, 0, 1),
    new Duration(0, 0, 0, 0, 0, 0, 0, -1),
    new Duration(0, 0, 0, 0, 0, 0, 0, 1),
    new Duration(0, 0, 0, 0, 0, 0, 0, -1),
    new Duration(0, 0, 0, 0, 0, 0, 0, -752043),
    new Duration(0, 0, 0, 0, 0, 0, 0, 3542924),
    new Duration(0, 0, 0, 0, 0, 0, 0, 86400000),
    new Duration(0, 0, 0, 0, 0, 0, 0, -86400000),
  ];

  // Fuzz it!
  for (let _i = 0; _i < 5000; _i++) {
    durs.push(
      new Duration(
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        randint(-500, 500) * 86400 + randint(-1000, 1000),
      ),
    );
  }

  const con = getClient();
  try {
    // Test encode/decode round trip.
    const dursFromDb = await con.query<any>(
      `
        WITH args := array_unpack(<array<duration>>$0)
        SELECT args;
      `,
      [durs],
    );

    for (let i = 0; i < durs.length; i++) {
      const roundedDur = Temporal.Duration.from(durs[i]).round({
        largestUnit: "hours",
        smallestUnit: "microseconds",
      });
      expect(roundedDur.years).toBe(dursFromDb[i].years);
      expect(roundedDur.months).toBe(dursFromDb[i].months);
      expect(roundedDur.weeks).toBe(dursFromDb[i].weeks);
      expect(roundedDur.days).toBe(dursFromDb[i].days);
      expect(roundedDur.hours).toBe(dursFromDb[i].hours);
      expect(roundedDur.minutes).toBe(dursFromDb[i].minutes);
      expect(roundedDur.seconds).toBe(dursFromDb[i].seconds);
      expect(roundedDur.milliseconds).toBe(dursFromDb[i].milliseconds);
      expect(roundedDur.microseconds).toBe(dursFromDb[i].microseconds);
      expect(roundedDur.nanoseconds).toBe(dursFromDb[i].nanoseconds);
      expect(roundedDur.sign).toBe(dursFromDb[i].sign);
    }
  } finally {
    await con.close();
  }
});

test("fetch: relative_duration", async () => {
  const con = getClient();
  let res: any;
  try {
    for (const time of [
      "24 hours",
      "68464977 seconds 74 milliseconds 11 microseconds",
      "-752043.296 milliseconds",
      "20 years 5 days 10 seconds",
      "3 months",
      "7 weeks 9 microseconds",
    ]) {
      res = await con.querySingle(
        `
          select (
            <cal::relative_duration><str>$time,
            <str><cal::relative_duration><str>$time,
          );
        `,
        { time },
      );
      expect(res[0].toString()).toBe(res[1]);

      const res2: any = await con.querySingle(
        `
        select <cal::relative_duration>$time;
        `,
        { time: res[0] },
      );
      expect(res2.toString()).toBe(res[0].toString());
    }
  } finally {
    await con.close();
  }
});

jest.setTimeout(10_000);
test("fetch: relative_duration fuzz", async () => {
  const randint = (min: number, max: number) => {
    const x = Math.round(Math.random() * (max - min) + min);
    return x === -0 ? 0 : x;
  };

  const durs = [
    new RelativeDuration(),
    new RelativeDuration(0, 0, 0, 0, 0, 0, 0, 1),
    new RelativeDuration(0, 0, 0, 0, 0, 0, 0, -1),
    new RelativeDuration(0, 0, 0, 0, 0, 0, 0, 1),
    new RelativeDuration(0, 0, 0, 0, 0, 0, 0, -1),
    new RelativeDuration(0, 0, 0, 0, 0, -12, -32, -43.296),
    new RelativeDuration(0, 0, 0, 0, 0, 59, 2, 924),
    new RelativeDuration(0, 0, 0, 0, 24, 0, 0, 0),
    new RelativeDuration(0, 0, 0, 0, -24, 0, 0, 0),
  ];

  // Fuzz it!
  for (let _i = 0; _i < 5000; _i++) {
    const sign = [-1, 1][randint(0, 2)];
    durs.push(
      new RelativeDuration(
        sign * randint(0, 100),
        sign * randint(0, 11),
        sign * randint(0, 3),
        sign * randint(0, 6),
        sign * randint(0, 23),
        sign * randint(0, 59),
        sign * randint(0, 59),
        sign * randint(0, 999),
        sign * randint(0, 999),
      ),
    );
  }

  const con = getClient();
  try {
    // Test encode/decode round trip.
    const dursFromDb: any = await con.query(
      `
          WITH args := array_unpack(<array<cal::relative_duration>>$0)
          SELECT args;
        `,
      [durs],
    );

    for (let i = 0; i < durs.length; i++) {
      expect(durs[i].toString()).toBe(dursFromDb[i].toString());
    }
  } finally {
    await con.close();
  }
});

test("fetch: ConfigMemory", async () => {
  const client = getClient();

  if (
    (await client.queryRequiredSingle(
      `select exists (select schema::Type filter .name = 'cfg::memory')`,
    )) === false
  ) {
    await client.close();
    return;
  }

  let res: any;
  try {
    for (const mem of [
      "0B",
      "0GiB",
      "1024MiB",
      "9223372036854775807B",
      "123KiB",
      "9MiB",
      "102938GiB",
      "108TiB",
      "42PiB",
    ]) {
      res = await client.querySingle(
        `
          select (
            <cfg::memory><str>$mem,
            <str><cfg::memory><str>$mem,
          );
        `,
        { mem },
      );
      expect(res[0].toString()).toBe(res[1]);

      const res2: any = await client.querySingle(
        `
        select <cfg::memory>$mem;
        `,
        { mem: res[0] },
      );
      expect(res2.toString()).toBe(res[0].toString());
    }
  } finally {
    await client.close();
  }
});

function expandRangeEQL(lower: string, upper: string) {
  return [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]
    .map(
      ([incl, incu]) =>
        `range(${lower}, ${upper}, inc_lower := ${incl}, inc_upper := ${incu})`,
    )
    .join(",\n");
}

function expandRangeJS(lower: any, upper: any) {
  return [
    new Range(lower, upper, false, false),
    new Range(lower, upper, true, false),
    new Range(lower, upper, false, true),
    new Range(lower, upper, true, true),
  ];
}

if (getGelVersion().major >= 2) {
  test("fetch: ranges", async () => {
    const client = getClient();

    try {
      const res = await client.querySingle<any>(`
        select {
          ints := (${expandRangeEQL("123", "456")}),
          floats := (${expandRangeEQL("123.456", "456.789")}),
          datetimes := (${expandRangeEQL(
            "<datetime>'2022-07-01T16:00:00+00'",
            "<datetime>'2022-07-01T16:30:00+00'",
          )}),
          local_dates := (${expandRangeEQL(
            "<cal::local_date>'2022-07-01'",
            "<cal::local_date>'2022-07-14'",
          )}),
          local_datetimes := (${expandRangeEQL(
            "<cal::local_datetime>'2022-07-01T12:00:00'",
            "<cal::local_datetime>'2022-07-14T12:00:00'",
          )}),
        }
      `);
      expect(res).toEqual({
        ints: [
          new Range(124, 456),
          new Range(123, 456),
          new Range(124, 457),
          new Range(123, 457),
        ],
        floats: expandRangeJS(123.456, 456.789),
        datetimes: expandRangeJS(
          new Date("2022-07-01T16:00:00Z"),
          new Date("2022-07-01T16:30:00Z"),
        ),
        local_dates: [
          new Range(new LocalDate(2022, 7, 2), new LocalDate(2022, 7, 14)),
          new Range(new LocalDate(2022, 7, 1), new LocalDate(2022, 7, 14)),
          new Range(new LocalDate(2022, 7, 2), new LocalDate(2022, 7, 15)),
          new Range(new LocalDate(2022, 7, 1), new LocalDate(2022, 7, 15)),
        ],
        local_datetimes: expandRangeJS(
          new LocalDateTime(2022, 7, 1, 12),
          new LocalDateTime(2022, 7, 14, 12),
        ),
      });

      expect(
        await client.querySingle(
          `select all({
            [${expandRangeEQL("123", "456")}] = <array<range<int64>>>$ints,
            [${expandRangeEQL(
              "123.456",
              "456.789",
            )}] = <array<range<float64>>>$floats,
            [${expandRangeEQL(
              "<datetime>'2022-07-01T16:00:00+00'",
              "<datetime>'2022-07-01T16:30:00+00'",
            )}] = <array<range<datetime>>>$datetimes,
            [${expandRangeEQL(
              "<cal::local_date>'2022-07-01'",
              "<cal::local_date>'2022-07-14'",
            )}] = <array<range<cal::local_date>>>$local_dates,
            [${expandRangeEQL(
              "<cal::local_datetime>'2022-07-01T12:00:00'",
              "<cal::local_datetime>'2022-07-14T12:00:00'",
            )}] = <array<range<cal::local_datetime>>>$local_datetimes,
          })`,
          res,
        ),
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  test("fetch: date_duration", async () => {
    const con = getClient();
    let res: any;
    try {
      for (const time of [
        "1 day",
        "-752043 days",
        "20 years 5 days",
        "3 months",
        "7 weeks",
      ]) {
        res = await con.querySingle(
          `
          select (
            <cal::date_duration><str>$time,
            <str><cal::date_duration><str>$time,
          );
        `,
          { time },
        );
        expect(res[0].toString()).toBe(res[1]);

        const res2: any = await con.querySingle(
          `
        select <cal::date_duration>$time;
        `,
          { time: res[0] },
        );
        expect(res2.toString()).toBe(res[0].toString());
      }
    } finally {
      await con.close();
    }
    return;
  });
}

if (getGelVersion().major >= 4) {
  test("fetch: multirange", async () => {
    const client = getClient();
    try {
      const expected = new MultiRange([new Range(1, 2)]);
      const multiRangeRes = await client.query<MultiRange<number>>(
        "select <multirange<int32>>$mr;",
        {
          mr: expected,
        },
      );

      expect(multiRangeRes).toEqual([expected]);

      // query to make sure we exercise the code path where we re-use the
      // multirange codec from the last query
      await client.query(
        `select {
          multirange := <multirange<int32>>$mr
        }`,
        { mr: expected },
      );
    } finally {
      await client.close();
    }
  });
}

test("fetch: tuple", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.query("select ()");
    expect(res).toEqual([[]]);

    res = await con.querySingle("select (1,)");
    expect(res).toEqual([1]);

    res = await con.query("select (1, 'abc')");
    expect(res).toEqual([[1, "abc"]]);

    res = await con.query("select {(1, 'abc'), (2, 'bcd')}");
    expect(res).toEqual([
      [1, "abc"],
      [2, "bcd"],
    ]);
    const t0: Array<any> = res[0];

    // Test that the exported type informs TypeScript that
    // it can be iterated over.
    const t0vals: unknown[] = [];
    for (const i of t0) {
      t0vals.push(i);
    }
    expect(t0vals).toEqual([1, "abc"]);

    expect(t0 instanceof Array).toBeTruthy();
    expect(t0[0]).toBe(1);
    expect(t0[1]).toBe("abc");
    expect(t0.length).toBe(2);
    expect(JSON.stringify(t0)).toBe('[1,"abc"]');
  } finally {
    await con.close();
  }
});

test("fetch: object", async () => {
  const con = getClient();

  let res: any;
  try {
    res = await con.querySingle(`
      select schema::Function {
        name,
        params: {
          kind,
          num,
          @foo := 42
        } order by .num asc
      }
      filter .name = 'std::str_repeat'
      limit 1
    `);

    expect(JSON.stringify(res)).toEqual(
      JSON.stringify({
        name: "std::str_repeat",
        params: [
          {
            kind: "PositionalParam",
            num: 0,
            "@foo": 42,
          },
          {
            kind: "PositionalParam",
            num: 1,
            "@foo": 42,
          },
        ],
      }),
    );

    expect(res.params[0].num).toBe(0);
    expect(res.params[1].num).toBe(1);

    expect(res.params.length).toBe(2);

    // regression test: test that empty sets are properly decoded.
    await con.querySingle(`
      select schema::Function {
        name,
        params: {
          kind,
        } limit 0,
        multi setarr := <array<int32>>{}
      }
      filter .name = 'std::str_repeat'
      limit 1
    `);
  } finally {
    await con.close();
  }
});

test("fetch: set of arrays", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`
      select schema::Function {
        id,
        sets := {[1, 2], [1]}
      }
      limit 1
    `);

    res = res.sets;
    expect(res).toEqual([[1, 2], [1]]);
    expect(res.length).toBe(2);
    expect(res instanceof Array).toBeTruthy();
    expect(res[1] instanceof Set).toBeFalsy();
    expect(res[1] instanceof Array).toBeTruthy();

    res = await con.query(`
      select {[1, 2], [1]};
    `);

    expect(res).toEqual([[1, 2], [1]]);
    expect(res.length).toBe(2);
    expect(res instanceof Array).toBeTruthy();
    expect(res[1] instanceof Array).toBeTruthy();
  } finally {
    await con.close();
  }
});

test("fetch: object implicit fields", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle(`
      select schema::Function {
        id,
      }
      limit 1
    `);

    expect(JSON.stringify(res)).toMatch(
      /^\{"id":"([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000)"\}$/,
    );

    res = await con.querySingle(`
      select schema::Function
      limit 1
    `);

    expect(JSON.stringify(res)).toBe(`{"id":"${res.id}"}`);

    res = await con.querySingle(`
      select schema::Function {
        name
      }
      filter .name = 'std::str_repeat'
      limit 1
    `);

    expect(JSON.stringify(res)).toBe('{"name":"std::str_repeat"}');
  } finally {
    await con.close();
  }
});

test("fetch: uuid", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle("SELECT schema::ObjectType.id LIMIT 1");
    expect(typeof res).toBe("string");
    expect(res.length).toBe(36);
    expect(res.replace(/\-/g, "").length).toBe(32);

    res = await con.querySingle(
      "SELECT <uuid>'759637d8-6635-11e9-b9d4-098002d459d5'",
    );
    expect(res).toBe("759637d8-6635-11e9-b9d4-098002d459d5");

    res = await con.queryRequiredSingle<string>(`SELECT uuid_generate_v1mc();`);
    const uuidRegex =
      /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;
    expect(uuidRegex.test(res)).toEqual(true);
  } finally {
    await con.close();
  }
});

test("fetch: enum", async () => {
  const client = getClient();

  try {
    await client.withRetryOptions({ attempts: 1 }).transaction(async (tx) => {
      await tx.execute(`
        CREATE SCALAR TYPE MyEnum EXTENDING enum<"A", "B">;
      `);

      // await tx.query("declare savepoint s1");
      // await tx
      //   .querySingle("SELECT <MyEnum><str>$0", ["Z"])
      //   .then(() => {
      //     throw new Error("an exception was expected");
      //   })
      //   .catch((e) => {
      //     expect(e.toString()).toMatch(/invalid input value for enum/);
      //   });
      // await tx.query("rollback to savepoint s1");

      let ret = await tx.querySingle("SELECT <MyEnum><str>$0", ["A"]);
      expect(ret).toBe("A");

      ret = await tx.querySingle("SELECT <MyEnum>$0", ["A"]);
      expect(ret).toBe("A");

      throw new CancelTransaction();
    });
  } catch (e) {
    if (!(e instanceof CancelTransaction)) {
      throw e;
    }
  } finally {
    await client.close();
  }
});

test("fetch: namedtuple", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle("select (a := 1)");
    expect(JSON.stringify(res)).toEqual(`{"a":1}`);
    expect(res["a"]).toEqual(1);

    res = await con.querySingle("select (a := 1, b:= 'abc')");
    expect(res["a"]).toEqual(1);
    expect(res["b"]).toEqual("abc");
    expect(JSON.stringify(res)).toEqual(`{"a":1,"b":"abc"}`);

    expect(require("util").inspect(res)).toBe("{ a: 1, b: 'abc' }");
  } finally {
    await con.close();
  }
});

test("querySingle: basic scalars", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle("select 'abc'");
    expect(res).toBe("abc");

    res = await con.querySingle("select 281474976710656;");
    expect(res).toBe(281474976710656);

    res = await con.querySingle("select <int32>2147483647;");
    expect(res).toBe(2147483647);
    res = await con.querySingle("select <int32>-2147483648;");
    expect(res).toBe(-2147483648);

    res = await con.querySingle("select <int16>-10;");
    expect(res).toBe(-10);

    res = await con.querySingle("select false;");
    expect(res).toBe(false);
  } finally {
    await con.close();
  }
});

test("querySingle: arrays", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingle("select [12312312, -1, 123, 0, 1]");
    expect(res).toEqual([12312312, -1, 123, 0, 1]);

    res = await con.querySingle("select ['aaa']");
    expect(res).toEqual(["aaa"]);

    res = await con.querySingle("select <array<str>>[]");
    expect(res).toEqual([]);

    res = await con.querySingle("select ['aaa', '', 'bbbb']");
    expect(res).toEqual(["aaa", "", "bbbb"]);

    res = await con.querySingle("select ['aaa', '', 'bbbb', '', 'aaaaaa🚀a']");
    expect(res).toEqual(["aaa", "", "bbbb", "", "aaaaaa🚀a"]);
  } finally {
    await con.close();
  }
});

jest.setTimeout(60_000);

test("querySingleJSON", async () => {
  const con = getClient();
  let res: any;
  try {
    res = await con.querySingleJSON("select (a := 1)");
    expect(JSON.parse(res)).toEqual({ a: 1 });

    res = await con.querySingleJSON("select (a := 1n)");
    expect(JSON.parse(res)).toEqual({ a: 1 });
    expect(typeof JSON.parse(res).a).toEqual("number");

    res = await con.querySingleJSON("select (a := 1.5n)");
    expect(JSON.parse(res)).toEqual({ a: 1.5 });
    expect(typeof JSON.parse(res).a).toEqual("number");
  } finally {
    await con.close();
  }
});

test("queryJSON", async () => {
  const con = getClient();
  try {
    const res = await con.queryJSON("select {(a := 1), (a := 2)}");
    expect(JSON.parse(res)).toEqual([{ a: 1 }, { a: 2 }]);
  } finally {
    await con.close();
  }
});

test("query(Required)Single cardinality", async () => {
  const client = getClient();

  const querySingleTests = async (conn: Executor) => {
    expect(await conn.querySingle(`select 'test'`)).toBe("test");
    expect(await conn.querySingle(`select <str>{}`)).toBe(null);
    await expect(
      conn.querySingle(`select {'multiple', 'test', 'strings'}`),
    ).rejects.toBeInstanceOf(ResultCardinalityMismatchError);
  };
  const queryRequiredSingleTests = async (conn: Executor) => {
    expect(await conn.queryRequiredSingle(`select 'test'`)).toBe("test");
    await expect(
      conn.queryRequiredSingle(`select <str>{}`),
    ).rejects.toBeInstanceOf(NoDataError);
    await expect(
      conn.queryRequiredSingle(`select {'multiple', 'test', 'strings'}`),
    ).rejects.toBeInstanceOf(ResultCardinalityMismatchError);
  };
  const querySingleJSONTests = async (conn: Executor) => {
    expect(await conn.querySingleJSON(`select 'test'`)).toBe('"test"');
    expect(await conn.querySingleJSON(`select <str>{}`)).toBe("null");
    await expect(
      conn.querySingleJSON(`select {'multiple', 'test', 'strings'}`),
    ).rejects.toBeInstanceOf(ResultCardinalityMismatchError);
  };
  const queryRequiredSingleJSONTests = async (conn: Executor) => {
    expect(await conn.queryRequiredSingleJSON(`select 'test'`)).toBe('"test"');
    await expect(
      conn.queryRequiredSingleJSON(`select <str>{}`),
    ).rejects.toBeInstanceOf(NoDataError);
    await expect(
      conn.queryRequiredSingleJSON(`select {'multiple', 'test', 'strings'}`),
    ).rejects.toBeInstanceOf(ResultCardinalityMismatchError);
  };

  for (const tests of [
    querySingleTests,
    queryRequiredSingleTests,
    querySingleJSONTests,
    queryRequiredSingleJSONTests,
  ]) {
    await tests(client);
    try {
      await client.transaction((tx) => tests(tx));
    } catch {}
  }

  client.close();
});

// test("querySingle wrong cardinality", async () => {
//   const con = getClient();
//   try {
//     await con
//       .queryRequiredSingleJSON("set module default")
//       .then(() => {
//         throw new Error("an exception was expected");
//       })
//       .catch((e) => {
//         expect(e.toString()).toMatch(
//           /queryRequiredSingleJSON\(\) returned no data/
//         );
//       });

//     await con
//       .queryRequiredSingle("set module default")
//       .then(() => {
//         throw new Error("an exception was expected");
//       })
//       .catch((e) => {
//         expect(e.toString()).toMatch(
//           /queryRequiredSingle\(\) returned no data/
//         );
//       });

//     await con.querySingleJSON("set module default").then((res) => {
//       expect(res).toBe("null");
//     });

//     await con.querySingle("set module default").then((res) => {
//       expect(res).toBe(null);
//     });
//   } finally {
//     await con.close();
//   }
// });

test("transaction state cleanup", async () => {
  // concurrency 1 to ensure we reuse the underlying connection
  const client = getClient({ concurrency: 1 });

  await expect(
    client.transaction(async (tx) => {
      try {
        await tx.query(`select 1/0`);
      } catch {
        // catch the error in the transaction so `transaction` method doesn't
        // attempt rollback
      }
    }),
  ).rejects.toThrow(/current transaction is aborted/);

  await expect(client.querySingle(`select 'success'`)).resolves.toBe("success");

  client.close();
});

test("execute", async () => {
  const con = getClient();
  try {
    await con
      .execute(`select 1/0;`)
      .then(() => {
        throw new Error("zero division was not propagated");
      })
      .catch((e: Error) => {
        expect(e.toString()).toMatch("division by zero");
        expect(e instanceof DivisionByZeroError).toBeTruthy();
        expect(e instanceof MissingRequiredError).toBeFalsy();
        expect(e instanceof GelError).toBeTruthy();
        expect((<DivisionByZeroError>e).code).toBe(0x05_01_00_01);
      });
  } finally {
    await con.close();
  }
});

test("scripts and args", async () => {
  const client = getClient();

  await client.execute(`create type ScriptTest {
    create property name -> str;
  };`);

  try {
    if (getGelVersion().major >= 2) {
      await expect(
        client.execute(
          `
          insert ScriptTest {
            name := 'test'
          }
          `,
          { name: "test" },
        ),
      ).rejects.toThrowError(QueryArgumentError);

      expect(
        await client.execute(`
          select 1 + 2;

          insert ScriptTest {
            name := 'test0'
          };`),
      ).toEqual(undefined);

      expect(await client.query(`select ScriptTest {name}`)).toEqual([
        { name: "test0" },
      ]);

      await expect(
        client.execute(
          `
          insert ScriptTest {
            name := <str>$name
          };

          insert ScriptTest {
            name := 'test' ++ <str>count(detached ScriptTest)
          };`,
        ),
      ).rejects.toThrowError(QueryArgumentError);

      await expect(
        client.execute(
          `
          insert ScriptTest {
            name := <str>$name
          };

          insert ScriptTest {
            name := 'test' ++ <str>count(detached ScriptTest)
          };`,
          { name: "test1" },
        ),
      ).resolves.toEqual(undefined);

      expect(await client.query(`select ScriptTest {name}`)).toEqual([
        { name: "test0" },
        { name: "test1" },
        { name: "test2" },
      ]);

      // expect(
      //   await client.query(
      //     `
      //     insert ScriptTest {
      //       name := <str>$name
      //     };

      //     insert ScriptTest {
      //       name := 'test' ++ <str>count(detached ScriptTest)
      //     };

      //     select ScriptTest.name;`,
      //     {name: "test3"}
      //   )
      // ).toEqual(["test0", "test1", "test2", "test3", "test4"]);
    } else {
      await expect(
        client.execute(
          `insert ScriptTest {
        name := <str>$name
      }`,
          { name: "test" },
        ),
      ).rejects.toThrowError(
        /arguments in execute\(\) is not supported in this version of Gel/,
      );

      await expect(
        client.execute(
          `insert ScriptTest {
        name := 'test'
      }`,
          { name: "test" },
        ),
      ).rejects.toThrowError(
        /arguments in execute\(\) is not supported in this version of Gel/,
      );

      await expect(
        client.query(`
          select 1 + 2;
          select 2 + 3;
        `),
      ).rejects.toThrowError();
    }
  } finally {
    await client.execute(`drop type ScriptTest;`);
    client.close();
  }
});

test("fetch/optimistic cache invalidation", async () => {
  const typename = "CacheInv_01";
  const query = `SELECT ${typename}.prop1 LIMIT 1`;
  const client = getClient();
  try {
    await client.transaction(async (tx) => {
      await tx.execute(`
        CREATE TYPE ${typename} {
          CREATE REQUIRED PROPERTY prop1 -> std::str;
        };

        INSERT ${typename} {
          prop1 := 'aaa'
        };
      `);

      for (let i = 0; i < 5; i++) {
        const res = await tx.querySingle(query);
        expect(res).toBe("aaa");
      }

      await tx.execute(`
        DELETE (SELECT ${typename});

        ALTER TYPE ${typename} {
          DROP PROPERTY prop1;
        };

        ALTER TYPE ${typename} {
          CREATE REQUIRED PROPERTY prop1 -> std::int64;
        };

        INSERT ${typename} {
          prop1 := 123
        };
      `);

      for (let i = 0; i < 5; i++) {
        const res = await tx.querySingle(query);
        expect(res).toBe(123);
      }

      throw new CancelTransaction();
    });
  } catch (e) {
    if (!(e instanceof CancelTransaction)) {
      throw e;
    }
  } finally {
    await client.close();
  }
});

test("concurrent ops", async () => {
  const pool = getClient();
  try {
    const p1 = pool.querySingle(`SELECT 1 + 2`);
    const p2 = pool.querySingle(`SELECT 2 + 2`);
    await Promise.all([p1, p2]);
    expect(await p1).toBe(3);
    expect(await p2).toBe(4);
  } finally {
    await pool.close();
  }
});

test("pretty error message", async () => {
  const client = getClient();

  let err: Error | null = null;
  try {
    await client.query(`select {
  ver := sys::get_version(),
  unknown := .abc,
};`);
  } catch (e) {
    err = e as Error;
  } finally {
    await client.close();
  }

  expect(err).toBeInstanceOf(InvalidReferenceError);
  expect(err?.toString()).toBe(
    `InvalidReferenceError: object type 'std::FreeObject' has no link or property 'abc'
   |
 3 |   unknown := .abc,
   |              ^^^^
`,
  );
});

test("warnings handler", async () => {
  if (getGelVersion().major < 6) return;

  let client = getClient();

  try {
    let warnings: GelError[] | null = null;
    client = client.withWarningHandler((_warnings) => (warnings = _warnings));

    await expect(client.query("select _warn_on_call();")).resolves.toEqual([0]);

    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings!.length).toBe(1);
    expect(warnings![0]).toBeInstanceOf(GelError);
    expect(warnings![0].message.trim()).toBe("Test warning please ignore");

    warnings = null;

    await expect(
      client.transaction((txn) => txn.query("select _warn_on_call();")),
    ).resolves.toEqual([0]);

    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings!.length).toBe(1);
    expect(warnings![0]).toBeInstanceOf(GelError);
    expect(warnings![0].message.trim()).toBe("Test warning please ignore");

    client = client.withWarningHandler(throwWarnings);

    await expect(client.query("select _warn_on_call();")).rejects.toThrow(
      /warnings occurred while running query: Test warning please ignore/,
    );
  } finally {
    await client.close();
  }
});

function _decodeResultBuffer(outCodec: _ICodec, resultData: Uint8Array) {
  const result = new Array();
  const buf = new _ReadBuffer(resultData);
  const codecReadBuf = _ReadBuffer.alloc();
  while (buf.length > 0) {
    const msgType = buf.readUInt8();
    const len = buf.readUInt32();

    if (msgType !== 68 || len <= 4) {
      throw new Error("invalid data packet");
    }

    buf.sliceInto(codecReadBuf, len - 4);
    codecReadBuf.discard(6);
    const val = outCodec.decode(codecReadBuf, NOOP_CODEC_CONTEXT);
    result.push(val);
  }
  return result;
}

if (getAvailableFeatures().has("binary-over-http")) {
  test("binary protocol over http", async () => {
    const codecsRegistry = new _CodecsRegistry();
    const config = await parseConnectArguments({
      ...getConnectOptions(),
      tlsSecurity: "insecure",
    });

    const gelVer = getGelVersion();
    const fetchConn = AdminUIFetchConnection.create(
      await getAuthenticatedFetch(
        config.connectionParams,
        getHTTPSCRAMAuth(cryptoUtils),
      ),
      codecsRegistry,
      [gelVer.major, gelVer.minor],
    );

    const query = `SELECT Function { name }`;
    const state = new Options({ module: "schema" });
    const options = {
      injectTypenames: true,
      implicitLimit: BigInt(5),
    } as const;

    const [_, outCodec] = await fetchConn.rawParse(
      Language.EDGEQL,
      query,
      state,
      options,
    );
    const resultData = await fetchConn.rawExecute(
      Language.EDGEQL,
      query,
      state,
      outCodec,
      options,
    );

    const result = _decodeResultBuffer(outCodec, resultData);

    expect(result).toHaveLength(5);
    expect(result[0]["__tname__"]).toBe("schema::Function");
  });

  test("binary protocol over http failing auth", async () => {
    const codecsRegistry = new _CodecsRegistry();
    const config = await parseConnectArguments({
      ...getConnectOptions(),
      tlsSecurity: "insecure",
    });
    const fetchConn = AdminUIFetchConnection.create(
      await getAuthenticatedFetch(
        config.connectionParams,
        async () => "invalid token",
      ),
      codecsRegistry,
    );

    await expect(
      fetchConn.rawParse(Language.EDGEQL, `select 1`, Options.defaults()),
    ).rejects.toThrow(AuthenticationError);
  });
}

if (getGelVersion().major >= 5) {
  test("fetch: int64 as bigint", async () => {
    const con = getClient().withCodecs({
      "std::int64": {
        toDatabase(data: bigint) {
          return data;
        },
        fromDatabase(data: bigint) {
          return data;
        },
      },
    });

    const vals = [
      "0",
      "-0",
      "1",
      "-1",
      "11",
      "-11",
      "110000",
      "-1100000",
      "113",
      "1152921504594725865",
      "-1152921504594725865",
    ];

    try {
      const fetched = await con.querySingle<any>(
        `
        WITH
          inp := <array<int64>>$0,
          inpStr := <array<str>>$1,
          str := <array<str>>inp,
        SELECT
          (inp, str, <array<int64>>inpStr)
      `,
        [vals.map((v) => BigInt(v)), vals],
      );

      expect(fetched[0].length).toBe(vals.length);
      for (let i = 0; i < fetched[0].length; i++) {
        expect(fetched[0][i]).toBe(fetched[2][i]);
        expect(fetched[0][i].toString()).toBe(fetched[1][i]);
      }
    } finally {
      await con.close();
    }
  });

  describe("withCodecs", () => {
    const client = getClient();

    beforeAll(async () => {
      await client.execute("create extension pgvector;");
      await client.execute(`
        CREATE SCALAR TYPE default::MyInt extending std::int32;
        CREATE SCALAR TYPE default::MySuperInt extending default::MyInt;
      `);
    });

    afterAll(async () => {
      await client.execute("drop extension pgvector;");
      await client.execute(`
        DROP SCALAR TYPE default::MySuperInt;
        DROP SCALAR TYPE default::MyInt;
      `);
      await client.close();
    });

    it("custom scalar type overrides", async () => {
      let r = await client.querySingle("select <MyInt>123");
      expect(r).toBe(123);

      const c2 = client.withCodecs({
        "default::MyInt": {
          toDatabase(val) {
            throw "not implemented";
          },
          fromDatabase(val) {
            return val + 10000;
          },
        } as Codecs.Int32Codec,
      });

      // c2 settings shouldn't affect the original client
      r = await client.querySingle("select <MyInt>123");
      expect(r).toBe(123);

      // let's test c2 now
      r = await c2.querySingle("select <MyInt>123");
      expect(r).toBe(10123);
      r = await c2.querySingle("select <MySuperInt>144");
      expect(r).toBe(10144);
      r = await c2.querySingle("select <int32>150");
      expect(r).toBe(150);

      // let's test again, that c2 settings shouldn't affect
      // the original client
      r = await client.querySingle("select <MyInt>123");
      expect(r).toBe(123);
    });

    it("supports all types", async () => {
      // A very simple roundtrip smoke test; checks the overall machinery
      // health, mundane check that type names are spelled correctly, etc.

      class Value {
        constructor(
          public type: string,
          public value: any,
        ) {}
      }

      // TODO: Add tests!
      type SkipCodecs =
        // halfvec requires Float16Array and I'm not sure we should
        // proxy a third-party lib through our API.
        | "ext::pgvector::halfvec"
        // just need to write a test
        | "ext::pgvector::sparsevec"
        // these are only available in Gel 6, and also re-use the
        // existing codecs, so I'm not too worried on testing them.
        | "std::pg::json"
        | "std::pg::timestamptz"
        | "std::pg::timestamp"
        | "std::pg::date"
        | "std::pg::interval"
        // postgis codecs need ext installed + already tested in postgis.test.ts
        | "ext::postgis::geometry"
        | "ext::postgis::geography"
        | "ext::postgis::box2d"
        | "ext::postgis::box3d";

      type CodecsToTest = SkipCodecs extends never
        ? keyof Codecs.ScalarCodecs
        : Exclude<keyof Codecs.ScalarCodecs, SkipCodecs>;

      type TestedCodecs = {
        [key in CodecsToTest]: CodecValueType<Codecs.ScalarCodecs[key]>;
      };

      const allCodecs: TestedCodecs = {
        "std::int16": -123,
        "std::int32": 12,
        "std::int64": 12398890798n,
        "std::float32": 0.1,
        "std::float64": -0.1,
        "std::bigint": 18292881028312n,
        "std::decimal": "-123121231231200031098082.123123123129083712987",
        "std::bool": false,
        "std::json": '{"a": true}',
        "std::str": "aaaa",
        "std::bytes": new Uint8Array([1, 2, 3, 4]),
        "std::uuid": new Uint8Array([
          1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4,
        ]),
        "cal::local_date": [2020, 5, 20],
        "cal::local_time": 121231213n,
        "cal::local_datetime": 91312311231088n,
        "cal::relative_duration": [10, 4, 12312312321n],
        "cal::date_duration": [2, 3],
        "std::datetime": 12121223163n,
        "std::duration": 1000002n,
        "cfg::memory": 99n,
        "ext::pgvector::vector": new Float32Array([1, -1, 0.3]),
      };

      const con = getClient().withCodecs(
        Object.fromEntries(
          Object.keys(allCodecs).map((tn) => {
            return [
              tn,
              {
                toDatabase(data: Value): any {
                  return data.value;
                },
                fromDatabase(data: any): Value {
                  return new Value(tn, data);
                },
              },
            ];
          }),
        ),
      );

      let args: any[] = [];
      let query = "select (";
      for (let [idx, [type, value]] of Object.entries(allCodecs).entries()) {
        query += `<${type}>\$${idx},`;
        args.push(new Value(type, value));
      }
      query += ")";

      try {
        const ret = (await con.querySingle(query, args)) as Array<Value>;

        expect(ret.length).toBe(args.length);

        for (let i = 0; i < ret.length; i++) {
          const tn = ret[i].type;
          expect(tn).toBe(args[i].type);

          try {
            if (ret[i].type.includes("float")) {
              expect(ret[i].value).toBeCloseTo(args[i].value);
            } else {
              expect(ret[i].value).toStrictEqual(args[i].value);
            }
          } catch (e) {
            console.error(`type ${tn}`);
            throw e;
          }
        }
      } finally {
        await con.close();
      }
    });
  });

  test("codec context invalidation", async () => {
    const query = `SELECT <CodecInv_01>'123'`;

    const client = getClient().withCodecs({
      "std::str": {
        toDatabase() {
          throw "not implemented";
        },
        fromDatabase(val) {
          return { str: val };
        },
      },
      "std::int32": {
        toDatabase() {
          throw "not implemented";
        },
        fromDatabase(val) {
          return { int: val };
        },
      },
    });

    try {
      await client.transaction(async (tx) => {
        await tx.execute(`
          CREATE SCALAR TYPE CodecInv_01 EXTENDING std::str;
        `);

        let ret = await tx.querySingle(query);
        expect(ret).toStrictEqual({ str: "123" });

        await tx.execute(`
          DROP SCALAR TYPE CodecInv_01;
          CREATE SCALAR TYPE CodecInv_01 EXTENDING std::int32;
        `);

        // If CodecContext wasn't invalidated and the previous one got
        // used to after running the above DDL, we'll have ret == {str: '123'},
        // because we'd still think that the appropriate codec for
        // 'CodecInv_01' would be one for 'std::str'.
        ret = await tx.querySingle(query);
        expect(ret).toStrictEqual({ int: 123 });

        throw new CancelTransaction();
      });
    } catch (e) {
      if (!(e instanceof CancelTransaction)) {
        throw e;
      }
    } finally {
      await client.close();
    }
  });
}

if (getGelVersion().major >= 6) {
  test("querySQL", async () => {
    let client = getClient().withSQLRowMode("array");

    try {
      let res = await client.querySQL("select 1 as c");
      expect(JSON.stringify(res)).toEqual("[[1]]");

      res = await client.querySQL("select 1 AS foo, 2 AS bar");
      expect(JSON.stringify(res)).toEqual("[[1,2]]");

      res = await client.querySQL("select 1 + $1::int8", [41]);
      expect(JSON.stringify(res)).toEqual("[[42]]");
    } finally {
      await client.close();
    }
  });

  test("withSQLRowMode in tx", async () => {
    let client = getClient().withSQLRowMode("array");

    try {
      let res = await client.querySQL("select 1 as c");
      expect(JSON.stringify(res)).toEqual("[[1]]");

      await client.transaction(async (tx) => {
        const tx2 = tx.withSQLRowMode("object");

        let res = await tx.querySQL("select 1 AS foo, 2 AS bar");
        expect(JSON.stringify(res)).toEqual("[[1,2]]");

        res = await tx2.querySQL("select 1 AS foo, 2 AS bar");
        expect(JSON.stringify(res)).toEqual('[{"foo":1,"bar":2}]');
      });

      res = await client.querySQL("select 1 + $1::int8", [41]);
      expect(JSON.stringify(res)).toEqual("[[42]]");
    } finally {
      await client.close();
    }
  });

  test("querySQL codec", async () => {
    let client = getClient();

    try {
      let res = await client.querySQL("select 1 as A");
      expect(JSON.stringify(res)).toEqual('[{"a":1}]');

      for (let i = 0; i < 2; i++) {
        res = await client
          .withCodecs({
            _private_sql_row: {
              fromDatabase(data, desc) {
                const ret = Object.fromEntries(
                  desc.names.map((key, index) => [key, data[index]]),
                );
                ret.added = true;
                return ret;
              },
              toDatabase() {
                throw "cannot encode SQL record as a query argument";
              },
            },
          })
          .querySQL("select 1 AS foo, 2 AS bar");
        expect(JSON.stringify(res)).toEqual('[{"foo":1,"bar":2,"added":true}]');

        res = await client
          .withSQLRowMode("array")
          .querySQL("select 1 AS foo, 2 AS bar");
        expect(JSON.stringify(res)).toEqual("[[1,2]]");

        res = await client
          .withSQLRowMode("object")
          .querySQL("select 1 AS foo, 2 AS bar");
        expect(JSON.stringify(res)).toEqual('[{"foo":1,"bar":2}]');

        res = await client.querySQL('select 1 + $1::int8 as "B"', [41]);
        expect(JSON.stringify(res)).toEqual('[{"B":42}]');
      }
    } finally {
      await client.close();
    }
  });

  test("executeSQL", async () => {
    let client = getClient();

    try {
      // just test that it doesn't crash
      await client.executeSQL("select 1");
    } finally {
      await client.close();
    }
  });

  test("transaction.SQL", async () => {
    const typename = "ExecuteSQL_01";
    const query = `SELECT ${typename}.prop1 LIMIT 1`;
    const client = getClient();
    try {
      await client.transaction(async (tx) => {
        await tx.execute(`
          CREATE TYPE ${typename} {
            CREATE REQUIRED PROPERTY prop1 -> std::str;
          };
        `);

        await tx.executeSQL(`
          INSERT INTO "${typename}" (prop1) VALUES (123);
        `);

        let res = await tx.querySingle(query);
        expect(res).toBe("123");

        await tx.querySQL(`
          UPDATE "${typename}" SET prop1 = '345';
        `);

        res = await tx.querySingle(query);
        expect(res).toBe("345");

        throw new CancelTransaction();
      });
    } catch (e) {
      if (!(e instanceof CancelTransaction)) {
        throw e;
      }
    } finally {
      await client.close();
    }
  });

  test("querySQL std::pg:: types", async () => {
    let client = getClient();

    const pgTypes: [string, any][] = [
      ["json", [{ abc: 123 }, "test", 456]],
      ["timestamptz", new Date()],
      ["timestamp", new LocalDateTime(2024, 11, 15, 16, 20, 1, 2, 3)],
      ["date", new LocalDate(2024, 11, 15)],
      ["interval", new RelativeDuration(1, 2, 3, 4, 5, 6, 7, 8, 9)],
    ];

    try {
      for (const [typename, val] of pgTypes) {
        const res = await client.querySQL<any>(
          `select $1::${typename} as "val"`,
          [val],
        );
        expect(JSON.stringify(res[0].val)).toEqual(JSON.stringify(val));
      }
    } finally {
      await client.close();
    }
  });
} else {
  test("SQL methods should fail nicely if proto v3 not supported", async () => {
    let client = getClient();

    try {
      const unsupportedError = new UnsupportedFeatureError(
        "the server does not support SQL queries, upgrade to 6.0 or newer",
      );

      await expect(client.querySQL("select 1")).rejects.toThrow(
        unsupportedError,
      );

      await expect(client.executeSQL("select 1")).rejects.toThrow(
        unsupportedError,
      );

      await expect(
        client.transaction((tx) => tx.querySQL("select 1")),
      ).rejects.toThrow(unsupportedError);
    } finally {
      await client.close();
    }
  });
}
