import assert from "node:assert/strict";
import { $, type Client } from "gel";
import e, { type $infer } from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc } from "./setupTeardown";
import { TypeKind } from "../../packages/generate/src/syntax/reflection";

describe("sets", () => {
  let client: Client;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("empty sets", async () => {
    assert.equal(e.set(), null);

    const stringSet = e.cast(e.str, e.set());
    assert.equal(stringSet.toEdgeQL(), `<std::str>{}`);
    tc.assert<tc.IsExact<$infer<typeof stringSet>, null>>(true);

    const $Hero = e.Hero.__element__;
    const heroSet = e.cast($Hero, e.set());
    assert.equal(heroSet.toEdgeQL(), `<default::Hero>{}`);
    tc.assert<tc.IsExact<$infer<typeof heroSet>, null>>(true);

    const int32Set = e.cast(e.int32, e.set());
    assert.equal(int32Set.toEdgeQL(), `<std::int32>{}`);
    tc.assert<tc.IsExact<$infer<typeof int32Set>, null>>(true);
    tc.assert<
      tc.IsExact<(typeof int32Set)["__element__"]["__name__"], "std::number">
    >(true);

    assert.equal(await e.cast(e.int64, e.set()).run(client), null);
  });

  test("object set contructor", async () => {
    const hero = e.set(e.default.Hero);
    assert.equal(hero.id.__element__.__name__, "std::uuid");
    assert.equal(hero.name.__element__.__name__, "std::str");
    assert.equal(hero.number_of_movies.__element__.__name__, "std::int64");

    const person = e.set(e.default.Hero, e.default.Villain);
    assert.equal(person.id.__element__.__name__, "std::uuid");
    assert.equal(person.name.__element__.__name__, "std::str");
    assert.deepEqual((person as any).number_of_movies, undefined);
    assert.equal(
      person.__element__.__name__,
      "default::Hero UNION default::Villain",
    );

    const merged = e.set(e.default.Hero, e.default.Villain, e.default.Person);
    assert.equal(
      merged.__element__.__name__,
      "default::Hero UNION default::Villain UNION default::Person",
    );

    assert.equal(
      e.set(e.select(e.Hero), e.select(e.Villain)).toEdgeQL(),
      `{ (SELECT DETACHED default::Hero), (SELECT DETACHED default::Villain) }`,
    );

    assert.deepEqual(
      await e
        .select(e.set(e.select(e.Hero), e.select(e.Villain)), (obj) => ({
          name: true,
          filter: e.op(obj.name, "=", "Thanos"),
        }))
        .assert_single()
        .run(client),
      { name: "Thanos" },
    );

    assert.deepEqual(
      await e
        .select(e.set(e.Hero, e.Villain), (obj) => ({
          name: true,
          filter: e.op(obj.name, "=", "Thanos"),
        }))
        .assert_single()
        .run(client),
      { name: "Thanos" },
    );
  });

  test("scalar set contructor", () => {
    // single elements
    const _f1 = e.set("asdf");
    assert.equal(_f1.__element__.__name__, "std::str");
    assert.deepEqual(_f1.__cardinality__, $.Cardinality.One);
    assert.deepEqual(_f1.__element__.__kind__, $.TypeKind.scalar);
    assert.equal(_f1.toEdgeQL(), `{ "asdf" }`);
    type _f1 = $infer<typeof _f1>;
    tc.assert<tc.IsExact<_f1, "asdf">>(true);

    const _f4 = e.set(e.int32(42));
    assert.equal(_f4.__element__.__name__, "std::int32");
    assert.deepEqual(_f4.__cardinality__, $.Cardinality.One);
    assert.deepEqual(_f4.__element__.__kind__, $.TypeKind.scalar);
    assert.equal(_f4.toEdgeQL(), `{ <std::int32>42 }`);
    type _f4 = $infer<typeof _f4>;
    tc.assert<tc.IsExact<_f4, 42>>(true);

    // multiple elements
    const _f2 = e.set("asdf", "qwer", e.str("poiu"));
    assert.equal(_f2.__element__.__name__, "std::str");
    assert.deepEqual(_f2.__cardinality__, $.Cardinality.AtLeastOne);
    assert.equal(_f2.toEdgeQL(), `{ "asdf", "qwer", "poiu" }`);
    type _f2 = $infer<typeof _f2>;
    tc.assert<tc.IsExact<_f2, [string, ...string[]]>>(true);

    const _f3 = e.set(1, 2, 3);
    assert.equal(_f3.__element__.__name__, "std::number");
    assert.deepEqual(_f3.__cardinality__, $.Cardinality.AtLeastOne);
    assert.equal(_f3.toEdgeQL(), `{ 1, 2, 3 }`);
    type _f3 = $infer<typeof _f3>;
    tc.assert<tc.IsExact<_f3, [number, ...number[]]>>(true);

    // implicit casting
    const _f5 = e.set(5, e.literal(e.float32, 1234.5));
    assert.equal(_f5.__element__.__name__, "std::number");
    assert.equal(_f5.toEdgeQL(), `{ 5, <std::float32>1234.5 }`);
    type _f5 = $infer<typeof _f5>;
    tc.assert<tc.IsExact<_f5, [number, ...number[]]>>(true);
  });

  test("invalid sets", () => {
    assert.throws(() => {
      // @ts-expect-error invalid set
      e.set(e.Hero, e.int64(1243));
    });

    // @ts-expect-error invalid set
    assert.throws(() => e.set(e.int64(5), e.bigint(BigInt(1234))));

    // never
    assert.throws(() => {
      // @ts-expect-error invalid set
      e.set(e.str("asdf"), e.int64(1243));
    });
    assert.throws(() => {
      // @ts-expect-error invalid set
      e.set(e.bool(true), e.bigint(BigInt(14)));
    });
  });

  test("enums", () => {
    const query = e.set(e.Genre.Action, e.Genre.Horror, e.Genre.Select);
    assert.equal(
      query.toEdgeQL(),
      "{ default::Genre.Action, default::Genre.Horror, default::Genre.`Select` }",
    );

    assert.throws(() => e.set(e.Genre.Action, e.sys.VersionStage.dev as any));
  });

  test("tuples", async () => {
    const q1 = e.set(
      e.tuple([1, "asdf", e.int16(214)]),
      e.tuple([3, "asdf", e.int64(5)]),
    );
    assert.deepEqual(q1.__element__.__kind__, TypeKind.tuple);
    assert.equal(q1.__element__.__items__[0].__name__, "std::number");
    assert.equal(q1.__element__.__items__[1].__name__, "std::str");
    assert.deepEqual(await q1.run(client), [
      [1, "asdf", 214],
      [3, "asdf", 5],
    ]);

    assert.throws(() => e.set(e.tuple([1]), e.tuple([1, 2])));
    assert.throws(() => e.set(e.tuple([1]), e.tuple(["asdf"])));
  });

  test("named tuples", async () => {
    const q1 = e.set(
      e.tuple({ a: 1, b: "asdf", c: e.int16(214) }),
      e.tuple({ a: 3, b: "asdf", c: e.int64(5) }),
    );
    assert.deepEqual(q1.__element__.__kind__, TypeKind.namedtuple);
    assert.deepEqual(await q1.run(client), [
      { a: 1, b: "asdf", c: 214 },
      { a: 3, b: "asdf", c: 5 },
    ]);

    assert.throws(() => e.set(e.tuple({ a: 1 }), e.tuple({ a: "asfd" })));
    assert.throws(() =>
      e.set(e.tuple({ a: 1 }), e.tuple({ a: "asfd", b: "qwer" })),
    );
    assert.throws(() =>
      e.set(e.tuple({ a: "asfd", b: "qwer" }), e.tuple({ a: 1 })),
    );
    assert.throws(() => e.set(e.tuple({ a: 1 }), e.tuple({ b: "asfd" })));
  });

  test("array", async () => {
    const q1 = e.set(e.array([e.int16(5), e.int64(67)]), e.array([6]));
    assert.deepEqual(q1.__element__.__kind__, TypeKind.array);

    assert.deepEqual(await q1.run(client), [[5, 67], [6]]);

    assert.throws(() => e.set(e.array([e.int16(5)]), e.array(["asdf"]) as any));
  });
});
