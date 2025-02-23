import assert from "node:assert/strict";
import superjson from "superjson";
import type { Client } from "gel";
import fc from "fast-check";
import e from "./dbschema/edgeql-js";
import * as $ from "../../packages/generate/src/syntax/reflection";

import { setupTests, teardownTests } from "./setupTeardown";

describe("operators", () => {
  let client: Client;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  function checkOperatorExpr<T extends $.$expr_Operator>(
    expr: T,
    name: T["__name__"],
    args: any[],
    returnType: T["__element__"],
    cardinality: T["__cardinality__"],
    edgeql?: string,
  ) {
    test(`${name} operator: expect ${edgeql ?? "(NO EDGEQL)"}`, async () => {
      assert.deepEqual(expr.__name__, name);
      assert.deepEqual(
        superjson.stringify(expr.__args__),
        superjson.stringify(args.filter((arg) => arg !== undefined)),
      );
      assert.deepEqual(expr.__element__, returnType);
      assert.deepEqual(expr.__cardinality__, cardinality);

      if (edgeql) {
        assert.deepEqual(expr.toEdgeQL(), edgeql);
      }
    });
  }

  describe("optional conditional ops", () => {
    checkOperatorExpr(
      e.op(e.str("hello"), "?=", e.cast(e.str, e.set())),
      "?=",
      [e.str("hello"), e.cast(e.str, e.set())],
      e.bool,
      $.Cardinality.One,
      `"hello" ?= <std::str>{}`,
    );
  });

  describe("slice and index ops", () => {
    checkOperatorExpr(
      e.str("test string")["2:5"],
      "[]",
      [e.str("test string"), [e.int64(2), e.int64(5)]],
      e.str,
      $.Cardinality.One,
      `"test string"[2:5]`,
    );

    checkOperatorExpr(
      e.str("test string").slice(e.int64(2), e.int64(5)),
      "[]",
      [e.str("test string"), [e.int64(2), e.int64(5)]],
      e.str,
      $.Cardinality.One,
      `"test string"[<std::int64>2:<std::int64>5]`,
    );

    checkOperatorExpr(
      e.array([BigInt(1), BigInt(2), BigInt(3)])["1:2"],
      "[]",
      [e.array([BigInt(1), BigInt(2), BigInt(3)]), [e.int64(1), e.int64(2)]],
      e.array(e.bigint),
      $.Cardinality.One,
      `[<std::bigint>1n, <std::bigint>2n, <std::bigint>3n][1:2]`,
    );

    checkOperatorExpr(
      e.str("test string")[3],
      "[]",
      [e.str("test string"), e.int64(3)],
      e.str,
      $.Cardinality.One,
      `"test string"[3]`,
    );

    checkOperatorExpr(
      e.str("test string").index(e.int64(3)),
      "[]",
      [e.str("test string"), e.int64(3)],
      e.str,
      $.Cardinality.One,
      `"test string"[<std::int64>3]`,
    );

    checkOperatorExpr(
      e.array([BigInt(1), BigInt(2), BigInt(3)])[2],
      "[]",
      [e.array([BigInt(1), BigInt(2), BigInt(3)]), e.int64(2)],
      e.bigint,
      $.Cardinality.One,
      `[<std::bigint>1n, <std::bigint>2n, <std::bigint>3n][2]`,
    );

    checkOperatorExpr(
      e.to_json(e.str(`{"name":"Bob"}`)).name,
      "[]",
      [e.to_json(e.str(`{"name":"Bob"}`)), e.str("name")],
      e.json,
      $.Cardinality.One,
      `std::to_json("{\\"name\\":\\"Bob\\"}")["name"]`,
    );

    checkOperatorExpr(
      e.to_json(e.str(`{"name":"Bob"}`)).destructure(e.str("name")),
      "[]",
      [e.to_json(e.str(`{"name":"Bob"}`)), e.str("name")],
      e.json,
      $.Cardinality.One,
      `std::to_json("{\\"name\\":\\"Bob\\"}")["name"]`,
    );
  });

  describe("if else op", () => {
    checkOperatorExpr(
      e.op(
        "this",
        "if",
        e.op(42, "=", e.literal(e.float32, 42)),
        "else",
        e.str("that"),
      ),
      "if_else",
      [e.str("this"), e.op(42, "=", e.literal(e.float32, 42)), e.str("that")],
      e.str,
      $.Cardinality.One,
      `"this" IF (42 = <std::float32>42) ELSE "that"`,
    );

    checkOperatorExpr(
      e.op("this", "if", e.cast(e.bool, e.set()), "else", "that"),
      "if_else",
      [e.str("this"), e.cast(e.bool, e.set()), e.str("that")],
      e.str,
      $.Cardinality.Empty,
      `"this" IF <std::bool>{} ELSE "that"`,
    );

    checkOperatorExpr(
      e.op("this", "if", e.set(e.bool(true), e.bool(false)), "else", "that"),
      "if_else",
      [e.str("this"), e.set(e.bool(true), e.bool(false)), e.str("that")],
      e.str,
      $.Cardinality.AtLeastOne,
      `"this" IF { true, false } ELSE "that"`,
    );

    checkOperatorExpr(
      e.op(
        e.str("this"),
        "if",
        e.op(e.literal(e.int64, 42), "=", e.literal(e.float32, 42)),
        "else",
        e.set(e.str("that"), e.str("other")),
      ),
      "if_else",
      [
        e.str("this"),
        e.op(e.literal(e.int64, 42), "=", e.literal(e.float32, 42)),
        e.set(e.str("that"), e.str("other")),
      ],
      e.str,
      $.Cardinality.AtLeastOne,
      `"this" IF (<std::int64>42 = <std::float32>42) ELSE { "that", "other" }`,
    );

    checkOperatorExpr(
      e.op(
        e.cast(e.str, e.set()),
        "if",
        e.op(e.literal(e.int64, 42), "=", e.literal(e.float32, 42)),
        "else",
        e.set(e.str("that"), e.str("other")),
      ),
      "if_else",
      [
        e.cast(e.str, e.set()),
        e.op(e.literal(e.int64, 42), "=", e.literal(e.float32, 42)),
        e.set(e.str("that"), e.str("other")),
      ],
      e.str,
      $.Cardinality.Many,
      `<std::str>{} IF (<std::int64>42 = <std::float32>42) ELSE { "that", "other" }`,
    );

    checkOperatorExpr(
      e.op(
        "this",
        "if",
        e.op(42, "=", e.literal(e.float32, 42)),
        "else",
        e.cast(e.str, e.set()),
      ),
      "if_else",
      [
        e.str("this"),
        e.op(42, "=", e.literal(e.float32, 42)),
        e.cast(e.str, e.set()),
      ],
      e.str,
      $.Cardinality.AtMostOne,
      `"this" IF (42 = <std::float32>42) ELSE <std::str>{}`,
    );

    checkOperatorExpr(
      e.op("if", e.bool(true), "then", e.int64(1), "else", e.int64(2)),
      "if_else",
      [e.int64(1), e.bool(true), e.int64(2)],
      e.int64,
      $.Cardinality.One,
      `<std::int64>1 IF true ELSE <std::int64>2`,
    );
  });

  test("random assortment of valid operators", () => {
    e.op(e.int64(10), "+", e.int64(20)); // int64 + int64
    e.op(e.float32(3.14), "*", e.float32(2.0)); // float32 * float32
    e.op(e.str("hello"), "++", e.str(" world")); // str ++ str
    e.op("not", e.bool(true)); // not bool
    e.op(e.datetime(new Date(2023, 5, 20)), "-", e.duration("PT5H")); // datetime - duration
    e.op(e.array([e.int32(1), e.int32(2)]), "++", e.array([e.int32(3)])); // array<int32> ++ array<int32>
    e.op(e.decimal("10.5"), "//", e.decimal("3")); // decimal // decimal
    e.op(e.json('{"a": 1}'), "++", e.json('{"b": 2}')); // json ++ json
    e.op(
      e.uuid("12345678-1234-5678-1234-567812345678"),
      "=",
      e.uuid("12345678-1234-5678-1234-567812345678"),
    ); // uuid = uuid
    e.op(
      e.bytes(new Uint8Array([1, 2])),
      "++",
      e.bytes(new Uint8Array([3, 4])),
    ); // bytes ++ bytes
    e.op(e.int16(10), "in", e.set(e.int16(5), e.int16(10), e.int16(15))); // int16 in set<int16>
    e.op(
      e.array([e.str("a"), e.str("b")]),
      "union",
      e.array([e.str("b"), e.str("c")]),
    ); // array<str> union array<str>
    e.op(
      e.tuple([e.int32(1), e.str("a")]),
      "in",
      e.tuple([e.int32(1), e.str("a")]),
    ); // tuple<int32, str> in tuple<int32, str>
    e.op(
      e.range(e.int32(1), e.int32(10)),
      "+",
      e.range(e.int32(5), e.int32(15)),
    ); // range<int32> + range<int32>
    e.op("if", e.bool(true), "then", e.int64(1), "else", e.int64(0)); // if bool then int64 else int64
  });

  test("random assortment of invalid operators", () => {
    assert.throws(
      // @ts-expect-error cannot compare int64 and str
      () => e.op(e.int64(10), "+", e.str("20")),
    );
    assert.throws(
      // @ts-expect-error cannot concat int64 and int64
      () => e.op(e.int64(10), "++", e.int64(20)),
    );
    assert.throws(
      // @ts-expect-error if condition must be bool
      () => e.op("if", 1, "then", e.int64(1), "else", e.int64(0)),
    );
    assert.throws(
      // @ts-expect-error cannot multiply number and object
      () => e.op(1, "*", e.cast(e.User, e.set())),
    );
    const json = e.json("{}");
    const uuid = e.uuid("00000000-0000-0000-0000-000000000000");
    assert.throws(
      // @ts-expect-error cannot concat json and uuid
      () => e.op(json, "++", uuid),
    );
    assert.throws(
      // @ts-expect-error if condition must be a boolean expression
      () => e.op("if", e.op(1, "+", 2), "then", e.int64(1), "else", e.int64(0)),
    );
    assert.throws(
      // @ts-expect-error not requires boolean operand
      () => e.op("not", e.int16(0)),
    );
    assert.throws(
      // @ts-expect-error ilike requires string operands
      () => e.op(e.int64(0), "ilike", "beep"),
    );
    assert.throws(
      // @ts-expect-error cannot concat date and bytes
      () => e.op(e.datetime_of_statement(), "++", e.bytes(new Uint8Array([0]))),
    );
  });

  test("non-literal args", async () => {
    const loki = e.select(e.Hero, (hero) => ({
      filter: e.op(hero.name, "=", "Loki"),
    }));
    const thanos = e.select(e.Villain, (villain) => ({
      filter: e.op(villain.name, "=", "Thanos"),
    }));

    const expr = e.op(loki, "??", thanos);

    const result = await expr.run(client);
    assert.ok(result);
  });

  describe("cardinalities for coalesce (??) operator", () => {
    const strElement = {
      __kind__: $.TypeKind.scalar,
      __name__: "str",
    };
    const emptySet = {
      __cardinality__: $.Cardinality.Empty,
      __element__: strElement,
    };
    const atMostOneSet = {
      __cardinality__: $.Cardinality.AtMostOne,
      __element__: strElement,
    };
    const oneSet = {
      __cardinality__: $.Cardinality.One,
      __element__: strElement,
    };
    const manySet = {
      __cardinality__: $.Cardinality.Many,
      __element__: strElement,
    };
    const atLeastOneSet = {
      __cardinality__: $.Cardinality.AtLeastOne,
      __element__: strElement,
    };

    const cardinalityPairs = [
      { lhs: emptySet, rhs: emptySet, expected: $.Cardinality.Empty },
      { lhs: emptySet, rhs: atMostOneSet, expected: $.Cardinality.AtMostOne },
      { lhs: emptySet, rhs: oneSet, expected: $.Cardinality.One },
      { lhs: emptySet, rhs: manySet, expected: $.Cardinality.Many },
      { lhs: emptySet, rhs: atLeastOneSet, expected: $.Cardinality.AtLeastOne },
      { lhs: atMostOneSet, rhs: emptySet, expected: $.Cardinality.AtMostOne },
      {
        lhs: atMostOneSet,
        rhs: atMostOneSet,
        expected: $.Cardinality.AtMostOne,
      },
      { lhs: atMostOneSet, rhs: oneSet, expected: $.Cardinality.One },
      { lhs: atMostOneSet, rhs: manySet, expected: $.Cardinality.Many },
      {
        lhs: atMostOneSet,
        rhs: atLeastOneSet,
        expected: $.Cardinality.AtLeastOne,
      },
      { lhs: oneSet, rhs: emptySet, expected: $.Cardinality.One },
      { lhs: oneSet, rhs: atMostOneSet, expected: $.Cardinality.One },
      { lhs: oneSet, rhs: oneSet, expected: $.Cardinality.One },
      { lhs: oneSet, rhs: manySet, expected: $.Cardinality.One },
      { lhs: oneSet, rhs: atLeastOneSet, expected: $.Cardinality.One },
      { lhs: manySet, rhs: emptySet, expected: $.Cardinality.Many },
      { lhs: manySet, rhs: atMostOneSet, expected: $.Cardinality.Many },
      { lhs: manySet, rhs: oneSet, expected: $.Cardinality.AtLeastOne },
      { lhs: manySet, rhs: manySet, expected: $.Cardinality.Many },
      { lhs: manySet, rhs: atLeastOneSet, expected: $.Cardinality.AtLeastOne },
      { lhs: atLeastOneSet, rhs: emptySet, expected: $.Cardinality.AtLeastOne },
      {
        lhs: atLeastOneSet,
        rhs: atMostOneSet,
        expected: $.Cardinality.AtLeastOne,
      },
      { lhs: atLeastOneSet, rhs: oneSet, expected: $.Cardinality.AtLeastOne },
      { lhs: atLeastOneSet, rhs: manySet, expected: $.Cardinality.AtLeastOne },
      {
        lhs: atLeastOneSet,
        rhs: atLeastOneSet,
        expected: $.Cardinality.AtLeastOne,
      },
    ];

    test.each(cardinalityPairs)(
      "Test $#: LHS: $lhs.__cardinality__, RHS: $rhs.__cardinality__, Expected: $expected",
      ({ lhs, rhs, expected }) => {
        const testExpr = e.op(lhs, "??", rhs);
        assert.deepEqual(testExpr.__cardinality__, expected);
      },
    );
  });

  test("cardinalities for set of operators", async () => {
    const t1 = e.op(e.cast(e.str, e.set()), "??", "default");
    assert.deepEqual(t1.__cardinality__, $.Cardinality.One);
    assert.equal(await t1.run(client), "default");

    const t2 = e.op(e.cast(e.str, e.set()), "union", "default");
    assert.deepEqual(t2.__cardinality__, $.Cardinality.One);
    assert.equal(await t1.run(client), "default");

    const t3 = e.op("one", "union", "two");
    assert.deepEqual(t3.__cardinality__, $.Cardinality.AtLeastOne);
    assert.deepEqual(await t3.run(client), ["one", "two"]);

    const t4 = e.op("distinct", "default");
    assert.deepEqual(t4.__cardinality__, $.Cardinality.One);
    assert.equal(await t4.run(client), "default");
  });
});

describe("property tests", () => {
  test("boolean composibility", () => {
    const comparisonOperators = ["=", "!="] as const;
    const logicalOperators = ["and", "or"] as const;

    const booleanArbitrary = fc.oneof(fc.boolean(), fc.boolean().map(e.bool));
    const stringArbitrary = fc.oneof(fc.string(), fc.string().map(e.str));
    const numberArbitrary = fc.oneof(
      fc.integer(),
      fc.float(),
      fc.integer().map(e.int64),
      fc.float().map(e.float64),
    );

    const comparisonOperatorArbitrary = fc.constantFrom(...comparisonOperators);
    const logicalOperatorArbitrary = fc.constantFrom(...logicalOperators);

    const expressionArbitrary = fc.letrec((tie) => ({
      booleanExpression: fc.oneof(
        booleanArbitrary,
        fc
          .tuple(
            tie("booleanExpression"),
            logicalOperatorArbitrary,
            tie("booleanExpression"),
          )
          .map(([left, operator, right]) =>
            e.op(left as boolean, operator, right as boolean),
          ),
      ),
      comparisonExpression: fc.oneof(
        { depthSize: "medium" },
        fc
          .tuple(stringArbitrary, comparisonOperatorArbitrary, stringArbitrary)
          .map(([left, operator, right]) => e.op(left, operator, right)),
        fc
          .tuple(numberArbitrary, comparisonOperatorArbitrary, numberArbitrary)
          .map(([left, operator, right]) => e.op(left, operator, right)),
        fc
          .tuple(
            tie("booleanExpression"),
            comparisonOperatorArbitrary,
            tie("booleanExpression"),
          )
          .map(([left, operator, right]) =>
            e.op(left as boolean, operator, right as boolean),
          ),
      ),
      expression: tie("comparisonExpression"),
    }));

    fc.assert(
      fc.property(expressionArbitrary.expression, (expr) => {
        if (expr && typeof expr === "object" && "__kind__" in expr) {
          expect(expr).toHaveProperty(
            "__kind__",
            expect.stringMatching(
              new RegExp(
                `${$.ExpressionKind.Operator}|${$.ExpressionKind.Literal}`,
              ),
            ),
          );
          expect(expr).toHaveProperty("__element__");
          expect(expr).toHaveProperty("__cardinality__");
          expect(expr).toHaveProperty("__name__");
          expect(expr).toHaveProperty("__opkind__");
          expect(expr).toHaveProperty("__args__");
        }
      }),
    );
  });

  test("object set composibility", () => {
    const setOperators = ["union", "intersect", "except"] as const;

    const stringArbitrary = fc.oneof(fc.string(), fc.string().map(e.str));
    const numberArbitrary = fc.oneof(
      fc.integer(),
      fc.float(),
      fc.integer().map(e.int64),
      fc.float().map(e.float64),
    );
    const objectArbitrary = fc.oneof(
      fc.constant(e.Person),
      fc.constant(e.Hero),
      fc.constant(e.Villain),
    );
    const stringSetArbitrary = fc.oneof(
      fc.constant(e.cast(e.str, e.set())),
      fc
        .array(stringArbitrary, { minLength: 1 })
        .map((strings) => e.set(...strings)),
    );
    const numberSetArbitrary = fc.oneof(
      fc.constant(e.cast(e.int64, e.set())),
      fc.constant(e.cast(e.float64, e.set())),
      fc
        .array(numberArbitrary, { minLength: 1 })
        .map((numbers) => e.set(...numbers)),
    );
    const objectSetArbitrary = fc.oneof(
      // Zero
      objectArbitrary.map((obj) => e.cast(obj, e.set())),
      // At most one object
      objectArbitrary.map((obj) => e.assert_single(e.select(obj))),
      // Exactly one object
      objectArbitrary.map((obj) => e.cast(obj, e.uuid(""))),
      // All objects
      objectArbitrary.map((obj) => e.select(obj)),
    );

    const setOperatorArbitrary = fc.constantFrom(...setOperators);

    const expressionArbitrary = fc.letrec((tie) => ({
      stringSetExpression: fc.oneof(
        stringSetArbitrary,
        fc
          .tuple(
            tie("stringSetExpression"),
            setOperatorArbitrary,
            tie("stringSetExpression"),
          )
          .map(([left, operator, right]) =>
            e.op(left as any, operator as any, right as any),
          ),
      ),
      numberSetExpression: fc.oneof(
        numberSetArbitrary,
        fc
          .tuple(
            tie("numberSetExpression"),
            setOperatorArbitrary,
            tie("numberSetExpression"),
          )
          .map(([left, operator, right]) =>
            e.op(left as any, operator as any, right as any),
          ),
      ),
      objectSetExpression: fc.oneof(
        objectSetArbitrary,
        fc
          .tuple(
            tie("objectSetExpression"),
            setOperatorArbitrary,
            tie("objectSetExpression"),
          )
          .map(([left, operator, right]) =>
            e.op(left as any, operator as any, right as any),
          ),
      ),
      expression: fc.oneof(
        tie("stringSetExpression"),
        tie("numberSetExpression"),
        tie("objectSetExpression"),
      ),
    }));

    fc.assert(
      fc.property(expressionArbitrary.expression, (expr) => {
        if (expr && typeof expr === "object" && "__kind__" in expr) {
          expect(expr).toHaveProperty("__kind__");

          if (expr.__kind__ === $.ExpressionKind.Operator) {
            expect(expr).toHaveProperty("__name__");
            expect(expr).toHaveProperty("__opkind__", $.OperatorKind.Infix);
            expect(expr).toHaveProperty("__args__", expect.any(Array));
          }

          expect(expr).toHaveProperty("__element__");
          expect(expr).toHaveProperty("__cardinality__");
        }
      }),
    );
  });
});
