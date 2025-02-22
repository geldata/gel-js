import assert from "node:assert/strict";
import * as gel from "gel";
import e from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc, versionGTE } from "./setupTeardown";

let client: gel.Client;

describe("params", () => {
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("simple params", () => {
    const query = e.params(
      {
        str: e.str,
        numArr: e.array(e.int64),
        optBool: e.optional(e.bool),
      },
      (params) =>
        e.select({
          str: params.str,
          nums: e.array_unpack(params.numArr),
          x: e.op("true", "if", params.optBool, "else", "false"),
        }),
    );

    assert.equal(
      query.toEdgeQL(),
      `\
WITH
  __param__str := <std::str>$str,
  __param__numArr := <array<std::int64>>$numArr,
  __param__optBool := <OPTIONAL std::bool>$optBool
SELECT (SELECT {
  single str := __param__str,
  multi nums := std::array_unpack(__param__numArr),
  single x := ("true" IF __param__optBool ELSE "false")
})`,
    );

    assert.throws(() => e.select(query).toEdgeQL());

    type paramsType = Parameters<typeof query.run>[1];
    tc.assert<
      tc.IsExact<
        paramsType,
        {
          str: string;
          numArr: readonly number[];
          optBool?: boolean | null;
        }
      >
    >(true);

    assert.rejects(
      // @ts-expect-error need to pass a params object
      query.run(client),
    );
  });

  test("complex params", async () => {
    const query = e.params(
      {
        str: e.str,
        numArr: e.array(e.int64),
        optBool: e.optional(e.bool),
        tuple: e.tuple([e.str, e.int32, e.array(e.bool)]),
        namedTuple: e.tuple({ a: e.float64, b: e.array(e.bigint), c: e.str }),
        jsonTuple: e.tuple([e.json]),
        people: e.array(
          e.tuple({ name: e.str, age: e.int64, tags: e.array(e.str) }),
        ),
      },
      (params) =>
        e.select({
          str: params.str,
          nums: e.array_unpack(params.numArr),
          x: e.op("true", "if", params.optBool, "else", "false"),
          tuple: params.tuple,
          tupleArrSlice: params.tuple[2].slice(1, null),
          namedTuple: params.namedTuple,
          namedTupleA: params.namedTuple.a,
          jsonTuple: params.jsonTuple,
          people: params.people,
        }),
    );

    type paramsType = Parameters<typeof query.run>[1];

    tc.assert<
      tc.IsExact<
        paramsType,
        {
          str: string;
          numArr: readonly number[];
          optBool?: boolean | null;
          tuple: readonly [string, number, readonly boolean[]];
          namedTuple: Readonly<{ a: number; b: readonly bigint[]; c: string }>;
          jsonTuple: readonly [unknown];
          people: readonly {
            name: string;
            age: number;
            tags: readonly string[];
          }[];
        }
      >
    >(true);

    const result = await query.run(client, {
      str: "test string",
      numArr: [1, 2, 3],
      tuple: ["str", 123, [true, false]],
      namedTuple: { a: 123, b: [BigInt(4), BigInt(5)], c: "str" },
      jsonTuple: [{ a: 123, b: ["c", "d"] }],
      people: [
        { name: "person a", age: 23, tags: ["a", "b"] },
        { name: "person b", age: 45, tags: ["b", "c"] },
      ],
    });

    assert.deepEqual(
      {
        ...result,
        nums: [...result.nums],
        tuple: [...result.tuple],
        namedTuple: {
          a: result.namedTuple.a,
          b: result.namedTuple.b,
          c: result.namedTuple.c,
        },
        jsonTuple: [...result.jsonTuple],
        people: result.people.map((p) => ({
          name: p.name,
          age: p.age,
          tags: [...p.tags],
        })),
      },
      {
        str: "test string",
        nums: [1, 2, 3],
        x: null,
        tuple: ["str", 123, [true, false]],
        tupleArrSlice: [false],
        namedTuple: { a: 123, b: [BigInt(4), BigInt(5)], c: "str" },
        namedTupleA: 123,
        jsonTuple: [{ a: 123, b: ["c", "d"] }],
        people: [
          { name: "person a", age: 23, tags: ["a", "b"] },
          { name: "person b", age: 45, tags: ["b", "c"] },
        ],
      },
    );
  });

  test("native tuple type params", async () => {
    const query = e.params({ test: e.tuple([e.str, e.int64]) }, ($) =>
      e.select($.test),
    );

    if (versionGTE(3)) {
      assert.equal(
        query.toEdgeQL(),
        `WITH
  __param__test := <tuple<std::str, std::int64>>$test
SELECT (SELECT __param__test)`,
      );
    } else {
      assert.equal(
        query.toEdgeQL(),
        `WITH
  __param__test := <tuple<std::str, std::int64>>to_json(<str>$test)
SELECT (SELECT __param__test)`,
      );
    }

    await query.run(client, { test: ["str", 123] });
  });

  test("all param types", async () => {
    const params = {
      int16: e.int16,
      int32: e.int32,
      int64: e.int64,
      float32: e.float32,
      float64: e.float64,
      bigint: e.bigint,
      decimal: e.decimal,
      bool: e.bool,
      json: e.json,
      str: e.str,
      bytes: e.bytes,
      uuid: e.uuid,
      datetime: e.datetime,
      genre: e.Genre,
      duration: e.duration,
      local_date: e.cal.local_date,
      local_time: e.cal.local_time,
      local_datetime: e.cal.local_datetime,
      relative_duration: e.cal.relative_duration,
      date_duration: e.cal.date_duration,
      memory: e.cfg.memory,
    };

    const query = e.params(params, (p) => e.select(p));

    const args = {
      int16: 1,
      int32: 2,
      int64: 3,
      float32: 4,
      float64: 5,
      bigint: BigInt(6),
      decimal: "123.4567890123456789",
      bool: true,
      json: '{"name": "test"}',
      str: "test str",
      bytes: new TextEncoder().encode("buffer"),
      uuid: "d476ccc2-3e7b-11ec-af13-0f07004006ce",
      datetime: new Date(),
      genre: "Action" as const,

      duration: new gel.Duration(0, 0, 0, 0, 1),
      local_date: new gel.LocalDate(2021, 11, 25),
      local_time: new gel.LocalTime(12, 34),
      local_datetime: new gel.LocalDateTime(2021, 11, 25, 1, 2, 3),
      relative_duration: new gel.RelativeDuration(1, 2, 3),
      date_duration: new gel.DateDuration(1, 2, 3, 4),
      memory: new gel.ConfigMemory(BigInt(125952)),
    };

    const result = await query.run(client, args);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          int16: number;
          int32: number;
          int64: number;
          float32: number;
          float64: number;
          bigint: bigint;
          decimal: string;
          bool: boolean;
          json: unknown;
          str: string;
          bytes: Uint8Array;
          uuid: string;
          datetime: Date;
          genre: "Horror" | "Action" | "RomCom" | "Science Fiction" | "Select";
          duration: gel.Duration;
          local_date: gel.LocalDate;
          local_time: gel.LocalTime;
          local_datetime: gel.LocalDateTime;
          relative_duration: gel.RelativeDuration;
          date_duration: gel.DateDuration;
          memory: gel.ConfigMemory;
        }
      >
    >(true);

    assert.deepEqual(result, args);

    const complexQuery = e.params(
      {
        tuple: e.tuple(params),
      },
      (p) => e.select(p),
    );

    const complexResult = await complexQuery.run(client, {
      tuple: args,
    });

    assert.deepEqual(complexResult.tuple, args);
  });

  test("v2 param types", async () => {
    const params = {
      date_duration: e.cal.date_duration,
    };

    const query = e.params(params, (p) => e.select(p));

    const args = {
      date_duration: new gel.DateDuration(1, 2, 3, 4),
    };

    const result = await query.run(client, args);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          date_duration: gel.DateDuration;
        }
      >
    >(true);

    assert.deepEqual(result, args);
  });

  test("non-runnable return expression", () => {
    const reusedExpr = e.set(1, 2, 3);

    const query = e.params({}, () => e.set(reusedExpr, reusedExpr));

    assert.doesNotThrow(() => query.toEdgeQL());
  });
});
