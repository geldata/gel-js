import assert from "node:assert/strict";
import type { Client } from "gel";
import * as $ from "../../packages/generate/src/syntax/reflection";
import e, { type $infer, objectTypeToTupleType } from "./dbschema/edgeql-js";
import type { sys } from "./dbschema/interfaces";

import { setupTests, teardownTests, tc, type TestData } from "./setupTeardown";
import type { $Genre, $year } from "./dbschema/edgeql-js/modules/default";
import type { $float64, $str, $uuid } from "./dbschema/edgeql-js/modules/std";

describe("collections", () => {
  let client: Client;
  let data: TestData;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("array literal", async () => {
    const strArrayType = e.array(e.str);
    assert.deepEqual(strArrayType.__kind__, $.TypeKind.array);
    assert.deepEqual(strArrayType.__element__.__kind__, $.TypeKind.scalar);
    assert.equal(strArrayType.__element__.__name__, "std::str");

    const arg = e.array(["asdf", e.str("qwer")]);

    type arg = $.setToTsType<typeof arg>;
    tc.assert<tc.IsExact<arg, string[]>>(true);
    assert.deepEqual(arg.__kind__, $.ExpressionKind.Array);
    assert.deepEqual(arg.__element__.__kind__, $.TypeKind.array);
    assert.deepEqual(arg.__cardinality__, $.Cardinality.One);
    assert.deepEqual(arg.__element__.__element__.__kind__, $.TypeKind.scalar);
    assert.equal(arg.__element__.__element__.__name__, "std::str");
    const result = await client.querySingle(e.select(arg).toEdgeQL());
    assert.deepEqual(result, ["asdf", "qwer"]);

    const arg1 = arg[1];
    tc.assert<tc.IsExact<(typeof arg1)["__kind__"], $.ExpressionKind.Operator>>(
      true,
    );
    assert.deepEqual(arg1.__kind__, $.ExpressionKind.Operator);
    tc.assert<tc.IsExact<(typeof arg1)["__cardinality__"], $.Cardinality.One>>(
      true,
    );
    assert.deepEqual(arg1.__cardinality__, $.Cardinality.One);
    tc.assert<tc.IsExact<(typeof arg1)["__element__"]["__name__"], "std::str">>(
      true,
    );
    assert.equal(arg1.__element__.__name__, "std::str");
    assert.equal(await e.select(arg1).run(client), "qwer");

    const multiArray = e.array(["asdf", e.set(e.str("qwer"), e.str("erty"))]);

    type multiArray = $.setToTsType<typeof multiArray>;
    tc.assert<tc.IsExact<multiArray, [string[], ...string[][]]>>(true);
    assert.deepEqual(multiArray.__kind__, $.ExpressionKind.Array);
    assert.deepEqual(multiArray.__element__.__kind__, $.TypeKind.array);

    assert.deepEqual(multiArray.__cardinality__, $.Cardinality.AtLeastOne);
    assert.deepEqual(
      multiArray.__element__.__element__.__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(multiArray.__element__.__element__.__name__, "std::str");
    const multiArrayResult = await client.query(
      e.select(multiArray).toEdgeQL(),
    );
    assert.deepEqual(multiArrayResult, [
      ["asdf", "qwer"],
      ["asdf", "erty"],
    ]);

    const multi0 = multiArray[0];
    tc.assert<
      tc.IsExact<(typeof multi0)["__cardinality__"], $.Cardinality.AtLeastOne>
    >(true);
    assert.deepEqual(multi0.__cardinality__, $.Cardinality.AtLeastOne);
    assert.deepEqual(await e.select(multi0).run(client), ["asdf", "asdf"]);

    // array slicing
    const arr = e.str_split(e.str("zxcvbnm"), e.str(""));
    const sliceResult = await e
      .select({
        reverseIndex: arr["-2"],
        slice24: arr["2:4"],
        slice2: arr["2:"],
        slice4: arr[":4"],
        reverseSlice2: arr["-2:"],
        reverseSlice4: arr[":-4"],
        reverseSlice24: arr["-4:-2"],
      })
      .run(client);
    tc.assert<
      tc.IsExact<
        typeof sliceResult,
        {
          reverseIndex: string;
          slice24: string[];
          slice2: string[];
          slice4: string[];
          reverseSlice2: string[];
          reverseSlice4: string[];
          reverseSlice24: string[];
        }
      >
    >(true);
    assert.deepEqual(
      JSON.stringify(sliceResult),
      JSON.stringify({
        reverseIndex: "n",
        slice24: ["c", "v"],
        slice2: ["c", "v", "b", "n", "m"],
        slice4: ["z", "x", "c", "v"],
        reverseSlice2: ["n", "m"],
        reverseSlice4: ["z", "x", "c"],
        reverseSlice24: ["v", "b"],
      }),
    );

    // @ts-expect-error does not include a str key
    let _ = arr["str"];
    // @ts-expect-error does not have a nonsense range operator
    _ = arr[":"];
  });

  test("tuple literal", async () => {
    const tupleType = e.tuple([e.str, e.int64]);
    assert.deepEqual(tupleType.__kind__, $.TypeKind.tuple);
    assert.deepEqual(tupleType.__items__[0].__kind__, $.TypeKind.scalar);
    assert.equal(tupleType.__items__[0].__name__, "std::str");
    assert.deepEqual(tupleType.__items__[1].__kind__, $.TypeKind.scalar);
    assert.equal(tupleType.__items__[1].__name__, "std::int64");

    const myTuple = e.tuple(["asdf", 45]);
    type myTuple = $.setToTsType<typeof myTuple>;
    tc.assert<tc.IsExact<myTuple, [string, number]>>(true);
    assert.deepEqual(myTuple.__element__.__kind__, $.TypeKind.tuple);
    assert.deepEqual(
      myTuple.__element__.__items__[0].__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(myTuple.__element__.__items__[0].__name__, "std::str");
    assert.deepEqual(
      myTuple.__element__.__items__[1].__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(myTuple.__element__.__items__[1].__name__, "std::number");
    const myTupleResult = await client.querySingle(
      e.select(myTuple).toEdgeQL(),
    );
    assert.deepEqual(myTupleResult, ["asdf", 45]);
    const myTuplePath0 = myTuple[0];
    const myTuplePath1 = myTuple[1];
    tc.assert<tc.IsExact<$infer<typeof myTuplePath0>, string>>(true);
    tc.assert<tc.IsExact<$infer<typeof myTuplePath1>, number>>(true);
    assert.equal(await e.select(myTuplePath0).run(client), "asdf");
    assert.equal(await e.select(myTuplePath1).run(client), 45);

    const multiTuple = e.tuple(["asdf", e.set(e.str("qwer"), e.str("erty"))]);
    tc.assert<
      tc.IsExact<
        $infer<typeof multiTuple>,
        [[string, string], ...[string, string][]]
      >
    >(true);
    assert.deepEqual(multiTuple.__kind__, $.ExpressionKind.Tuple);
    assert.deepEqual(multiTuple.__element__.__kind__, $.TypeKind.tuple);
    assert.deepEqual(multiTuple.__cardinality__, $.Cardinality.AtLeastOne);
    assert.deepEqual(
      multiTuple.__element__.__items__[0].__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(multiTuple.__element__.__items__[0].__name__, "std::str");
    assert.equal(multiTuple.__element__.__items__[1].__name__, "std::str");
    const multiTupleResult = await client.query(
      e.select(multiTuple).toEdgeQL(),
    );
    assert.deepEqual(multiTupleResult, [
      ["asdf", "qwer"],
      ["asdf", "erty"],
    ]);
    const multiTuplePath = multiTuple[0];
    tc.assert<tc.IsExact<$infer<typeof multiTuplePath>, [string, ...string[]]>>(
      true,
    );
    tc.assert<
      tc.IsExact<
        (typeof multiTuplePath)["__cardinality__"],
        $.Cardinality.AtLeastOne
      >
    >(true);
    assert.deepEqual(multiTuplePath.__cardinality__, $.Cardinality.AtLeastOne);
    assert.deepEqual(await e.select(multiTuplePath).run(client), [
      "asdf",
      "asdf",
    ]);

    const singleTuple = e.tuple([e.str("asdf")]);
    type singleTuple = $infer<typeof singleTuple>;
    tc.assert<tc.IsExact<singleTuple, [string]>>(true);
    assert.deepEqual(singleTuple.__element__.__kind__, $.TypeKind.tuple);
    assert.deepEqual(
      singleTuple.__element__.__items__[0].__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(singleTuple.__element__.__items__[0].__name__, "std::str");
    const singleTupleResult = await client.querySingle(
      e.select(singleTuple).toEdgeQL(),
    );
    assert.deepEqual(singleTupleResult, ["asdf"]);

    const nestedTuple = e.tuple([
      "a",
      e.tuple(["b", e.set(e.str("c"), e.str("d"))]),
    ]);
    type nestedTuple = $infer<typeof nestedTuple>;
    tc.assert<
      tc.IsExact<
        nestedTuple,
        [[string, [string, string]], ...[string, [string, string]][]]
      >
    >(true);
    const nestedTupleResult = await e.select(nestedTuple).run(client);
    assert.deepEqual(nestedTupleResult, [
      ["a", ["b", "c"]],
      ["a", ["b", "d"]],
    ]);
    const nestedTuplePathResult = await e
      .select({
        tup0: nestedTuple[0],
        tup1: nestedTuple[1],
        tup10: nestedTuple[1][0],
        tup11: nestedTuple[1][1],
      })
      .run(client);
    tc.assert<
      tc.IsExact<
        typeof nestedTuplePathResult,
        {
          tup0: [string, ...string[]];
          tup1: [[string, string], ...[string, string][]];
          tup10: [string, ...string[]];
          tup11: [string, ...string[]];
        }
      >
    >(true);
    assert.deepEqual(JSON.parse(JSON.stringify(nestedTuplePathResult)), {
      tup0: ["a", "a"],
      tup1: [
        ["b", "c"],
        ["b", "d"],
      ],
      tup10: ["b", "b"],
      tup11: ["c", "d"],
    });

    const heroNamesTuple = e.tuple([e.Hero.name]);
    type heroNamesTuple = $infer<typeof heroNamesTuple>;
    tc.assert<tc.IsExact<heroNamesTuple, [string][]>>(true);
    assert.deepEqual(heroNamesTuple.__element__.__kind__, $.TypeKind.tuple);
    assert.deepEqual(
      heroNamesTuple.__element__.__items__[0].__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(heroNamesTuple.__element__.__items__[0].__name__, "std::str");
    const heroNamesTupleResult = await e.select(heroNamesTuple).run(client);
    assert.deepEqual(
      heroNamesTupleResult.sort((a, b) => a[0].localeCompare(b[0])),
      [[data.cap.name], [data.iron_man.name], [data.spidey.name]].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    );
  });

  test("namedTuple literal", async () => {
    const tupleType = e.tuple({
      string: e.str,
      number: e.int64,
    });
    assert.deepEqual(tupleType.__kind__, $.TypeKind.namedtuple);
    assert.deepEqual(tupleType.__shape__.string.__kind__, $.TypeKind.scalar);
    assert.equal(tupleType.__shape__.string.__name__, "std::str");
    assert.deepEqual(tupleType.__shape__.number.__kind__, $.TypeKind.scalar);
    assert.equal(tupleType.__shape__.number.__name__, "std::int64");

    const named = e.tuple({
      string: "asdf",
      number: 1234,
    });

    type named = $.setToTsType<typeof named>;
    tc.assert<tc.IsExact<named, { string: string; number: number }>>(true);
    assert.deepEqual(named.__kind__, $.ExpressionKind.NamedTuple);
    assert.deepEqual(named.__element__.__kind__, $.TypeKind.namedtuple);
    assert.deepEqual(named.__cardinality__, $.Cardinality.One);
    assert.deepEqual(named.__shape__.string.__kind__, $.ExpressionKind.Literal);
    assert.equal(named.__shape__.string.__value__, "asdf");
    assert.deepEqual(named.__shape__.number.__kind__, $.ExpressionKind.Literal);
    assert.equal(named.__shape__.number.__value__, 1234);
    assert.deepEqual(
      named.__element__.__shape__.string.__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(named.__element__.__shape__.string.__name__, "std::str");
    assert.deepEqual(
      named.__element__.__shape__.number.__kind__,
      $.TypeKind.scalar,
    );
    assert.equal(named.__element__.__shape__.number.__name__, "std::number");
    const namedResult = await client.querySingle(e.select(named).toEdgeQL());
    assert.deepEqual(
      JSON.stringify(namedResult),
      JSON.stringify({ string: "asdf", number: 1234 }),
    );
    const namedStr = named.string;
    const namedNum = named.number;
    tc.assert<tc.IsExact<$infer<typeof namedStr>, string>>(true);
    tc.assert<tc.IsExact<$infer<typeof namedNum>, number>>(true);
    assert.equal(await e.select(namedStr).run(client), "asdf");
    assert.equal(await e.select(namedNum).run(client), 1234);

    const nested = e.tuple({
      a: "asdf",
      named: e.tuple({ b: 123 }),
      tuple: e.tuple([true, e.set(e.str("x"), e.str("y"))]),
    });
    const nestedResult = await e
      .select({
        nested: nested,
        nestedA: nested.a,
        nestedNamed: nested.named,
        nestedTuple: nested.tuple,
        nestedTuple0: nested.tuple[0],
        nestedTuple1: nested.tuple[1],
      })
      .run(client);
    tc.assert<
      tc.IsExact<
        typeof nestedResult,
        {
          nested: {
            a: string;
            named: { b: number };
            tuple: [boolean, string];
          }[];
          nestedA: string[];
          nestedNamed: { b: number }[];
          nestedTuple: [boolean, string][];
          nestedTuple0: boolean[];
          nestedTuple1: string[];
        }
      >
    >(true);
    assert.deepEqual(
      JSON.stringify(nestedResult),
      JSON.stringify({
        nested: [
          { a: "asdf", named: { b: 123 }, tuple: [true, "x"] },
          { a: "asdf", named: { b: 123 }, tuple: [true, "y"] },
        ],
        nestedA: ["asdf", "asdf"],
        nestedNamed: [{ b: 123 }, { b: 123 }],
        nestedTuple: [
          [true, "x"],
          [true, "y"],
        ],
        nestedTuple0: [true, true],
        nestedTuple1: ["x", "y"],
      }),
    );

    const emptyNamedTuple = e.tuple({ string: e.cast(e.str, e.set()) });
    type emptyNamedTuple = $.setToTsType<typeof emptyNamedTuple>;
    tc.assert<tc.IsExact<emptyNamedTuple, null>>(true);
    assert.deepEqual(emptyNamedTuple.__cardinality__, $.Cardinality.Empty);

    const multiNamedTuple = e.tuple({
      hero: e.Hero,
    });
    type multiNamedTuple = $.setToTsType<typeof multiNamedTuple>;
    tc.assert<
      tc.IsExact<
        multiNamedTuple,
        {
          hero: {
            id: string;
          };
        }[]
      >
    >(true);
    assert.deepEqual(multiNamedTuple.__cardinality__, $.Cardinality.Many);
  });

  test("non literal tuples", async () => {
    const ver = e.sys.get_version();
    assert.equal(ver.major.__element__.__name__, "std::int64");
    assert.deepEqual(ver.major.__cardinality__, $.Cardinality.One);
    assert.equal(ver.stage.__element__.__name__, "sys::VersionStage");
    assert.deepEqual(ver.stage.__cardinality__, $.Cardinality.One);
    assert.equal(ver.local.__element__.__name__, "array<std::str>");
    assert.deepEqual(ver.local.__cardinality__, $.Cardinality.One);

    const result = await e
      .select({
        ver,
        verMajor: ver.major,
        verStage: ver.stage,
        verLocal: ver.local,
        verLocal0: ver.local[0],
      })
      .run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          ver: {
            major: number;
            minor: number;
            stage: `${sys.VersionStage}`;
            stage_no: number;
            local: string[];
          };
          verMajor: number;
          verStage: `${sys.VersionStage}`;
          verLocal: string[];
          verLocal0: string;
        }
      >
    >(true);

    assert.deepEqual(
      {
        major: result.verMajor,
        stage: result.verStage,
        local: result.verLocal,
        local0: result.verLocal0,
      },
      {
        major: result.ver.major,
        stage: result.ver.stage,
        local: result.ver.local,
        local0: result.ver.local[0],
      },
    );
  });

  test("objectTypeToTupleType helper", () => {
    const movieTuple = objectTypeToTupleType(e.Movie);

    assert.equal(movieTuple["__kind__"], "namedtuple");
    assert.equal(movieTuple["__name__"].slice(0, 6), "tuple<");
    assert.deepEqual(movieTuple["__name__"].slice(6, -1).split(", ").sort(), [
      "genre: default::Genre",
      "rating: std::float64",
      "release_year: default::year",
      "title: std::str",
    ]);

    tc.assert<
      tc.IsExact<
        (typeof movieTuple)["__shape__"],
        { genre: $Genre; rating: $float64; title: $str; release_year: $year }
      >
    >(true);

    const movieTupleWithFields = objectTypeToTupleType(e.Movie, [
      "id",
      "title",
      "release_year",
    ]);

    assert.equal(movieTupleWithFields["__kind__"], "namedtuple");
    assert.equal(movieTupleWithFields["__name__"].slice(0, 6), "tuple<");
    assert.deepEqual(
      movieTupleWithFields["__name__"].slice(6, -1).split(", ").sort(),
      ["id: std::uuid", "release_year: default::year", "title: std::str"],
    );

    tc.assert<
      tc.IsExact<
        (typeof movieTupleWithFields)["__shape__"],
        { id: $uuid; title: $str; release_year: $year }
      >
    >(true);
  });
});
