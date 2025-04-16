import assert from "node:assert/strict";
import * as gel from "gel";
import * as fc from "fast-check";

import * as $ from "./dbschema/edgeql-js/reflection";
import e, { type $infer } from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc, type TestData } from "./setupTeardown";

let client: gel.Client;
let data: TestData;

describe("select", () => {
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("basic select", () => {
    const result = e.select(e.std.str("asdf"));
    type result = $infer<typeof result>;
    tc.assert<tc.IsExact<result, "asdf">>(true);
  });

  test("selecting JS data", () => {
    const strSelect = e.select("test");
    assert.equal(strSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(strSelect.__element__, e.str);
    assert.equal(strSelect.__cardinality__, $.Cardinality.One);

    const numberSelect = e.select(1234);
    assert.equal(numberSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(numberSelect.__element__.__name__, `std::number`);
    assert.equal(numberSelect.__cardinality__, $.Cardinality.One);

    const boolSelect = e.select(false);
    assert.equal(boolSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(boolSelect.__element__, e.bool);
    assert.equal(boolSelect.__cardinality__, $.Cardinality.One);

    const bigintSelect = e.select(BigInt(1234));
    assert.equal(bigintSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(bigintSelect.__element__, e.bigint);
    assert.equal(bigintSelect.__cardinality__, $.Cardinality.One);

    const bufferSelect = e.select(Buffer.from([]));
    assert.equal(bufferSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(bufferSelect.__element__, e.bytes);
    assert.equal(bufferSelect.__cardinality__, $.Cardinality.One);

    const dateSelect = e.select(new Date());
    assert.equal(dateSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(dateSelect.__element__, e.datetime);
    assert.equal(dateSelect.__cardinality__, $.Cardinality.One);

    const durationSelect = e.select(new gel.Duration());
    assert.equal(durationSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(durationSelect.__element__, e.duration);
    assert.equal(durationSelect.__cardinality__, $.Cardinality.One);

    const ldrSelect = e.select(new gel.LocalDateTime(1, 2, 3));
    assert.equal(ldrSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(ldrSelect.__element__, e.cal.local_datetime);
    assert.equal(ldrSelect.__cardinality__, $.Cardinality.One);

    const ldSelect = e.select(new gel.LocalDate(1, 2, 3));
    assert.equal(ldSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(ldSelect.__element__, e.cal.local_date);
    assert.equal(ldSelect.__cardinality__, $.Cardinality.One);

    const ltSelect = e.select(new gel.LocalTime(1, 2, 3));
    assert.equal(ltSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(ltSelect.__element__, e.cal.local_time);
    assert.equal(ltSelect.__cardinality__, $.Cardinality.One);

    const rdSelect = e.select(new gel.RelativeDuration(1, 2, 3));
    assert.equal(rdSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(rdSelect.__element__, e.cal.relative_duration);
    assert.equal(rdSelect.__cardinality__, $.Cardinality.One);

    const memSelect = e.select(new gel.ConfigMemory(BigInt(1234)));
    assert.equal(memSelect.__kind__, $.ExpressionKind.Select);
    assert.equal(memSelect.__element__, e.cfg.memory);
    assert.equal(memSelect.__cardinality__, $.Cardinality.One);
  });

  test("no shape", async () => {
    const query = e.select(e.default.Hero);
    const result = await query.run(client);
    tc.assert<tc.IsExact<typeof result, { id: string }[]>>(true);
    assert.deepEqual(
      query.__element__.__shape__,
      e.default.Hero.__element__.__shape__,
    );
    assert.equal(
      result.every((val) => !!val.id),
      true,
    );
  });

  test("computed only shape", () => {
    const query = e.select(e.Hero, (hero) => ({
      upper_name: e.str_upper(hero.name),
    }));

    tc.assert<tc.IsExact<$infer<typeof query>, { upper_name: string }[]>>(true);
  });

  const q1 = e.select(e.Hero, () => ({
    id: true,
    secret_identity: true,
    name: 1 > 0,
    villains: {
      id: true,
      computed: e.str("test"),
    },
    computed: e.str("test"),
  }));

  type q1 = $.setToTsType<typeof q1>;

  test("path construction", () => {
    const result = e.select(e.default.Hero);
    assert.equal(result.villains.nemesis.name.__element__.__name__, "std::str");
  });

  test("complex shape", () => {
    type q1type = $.BaseTypeToTsType<(typeof q1)["__element__"]>;
    tc.assert<
      tc.IsExact<
        q1type,
        {
          id: string;
          name: string | undefined;
          secret_identity: string | null;
          villains: {
            id: string;
            computed: "test";
          }[];
          computed: "test";
        }
      >
    >(true);
  });

  test("deep shape", () => {
    const deep = e.select(e.Hero, () => ({
      id: true,
      __type__: {
        name: true,
        __type__: {
          id: true,
          __type__: {
            id: true,
            name: true,
          },
        },
      },
    }));
    type deep = $infer<typeof deep>;
    tc.assert<
      tc.IsExact<
        deep,
        {
          id: string;
          __type__: {
            name: "default::Hero";

            __type__: {
              id: string;
              __type__: {
                id: string;
                name: "schema::ObjectType";
              };
            };
          };
        }[]
      >
    >(true);
  });

  test("nested free object", async () => {
    const hero = e.select(e.Hero, () => ({ limit: 1 }));
    const villain = e.select(e.Villain, () => ({ limit: 1 }));

    const q = await e
      .select({
        hero,
        villain,
      })
      .run(client);

    assert.ok(q.hero);
    assert.ok(q.villain);
  });

  test("compositionality", () => {
    // selecting a select statement should
    // default to { id }
    const no_shape = e.select(q1);

    type no_shape = $.BaseTypeToTsType<(typeof no_shape)["__element__"]>;
    type q1 = $.BaseTypeToTsType<(typeof q1)["__element__"]>;
    tc.assert<tc.IsExact<no_shape, q1>>(true);
    assert.deepEqual(no_shape.__element__.__shape__, q1.__element__.__shape__);

    // allow override shape
    const override_shape = e.select(q1, () => ({
      id: true,
      secret_identity: true,
    }));
    type override_shape = $.BaseTypeToTsType<
      (typeof override_shape)["__element__"]
    >;
    tc.assert<
      tc.IsExact<
        override_shape,
        {
          id: string;
          secret_identity: string | null;
        }
      >
    >(true);
  });

  test("polymorphism", () => {
    const query = e.select(e.Person, () => ({
      id: true,
      name: true,
      ...e.is(e.Hero, { secret_identity: true }),
      ...e.is(e.Villain, {
        nemesis: { name: true },
      }),
    }));
    // query.__element__.

    assert.deepEqual(query.__kind__, $.ExpressionKind.Select);
    assert.deepEqual(query.__element__.__kind__, $.TypeKind.object);
    assert.equal(query.__element__.__name__, "default::Person");

    type result = $infer<typeof query>[number];
    tc.assert<
      tc.IsExact<
        result,
        {
          id: string;
          name: string;
        } & (
          | {
              __typename: "default::Hero";
              secret_identity: string | null;
            }
          | {
              __typename: "default::Villain";
              nemesis: {
                name: string;
              } | null;
            }
        )
      >
    >(true);
  });

  test("polymorphic with nested modifiers", () => {
    e.is(e.Villain, {
      id: true,
    });

    e.select(e.Person, () => ({
      id: true,
      name: true,
      ...e.is(e.Villain, {
        nemesis: (hero) => ({
          name: true,
          order_by: hero.name,
          filter: e.op(hero.name, "=", hero.name),
          limit: 1,
          offset: 10,
        }),
      }),
    }));
  });

  test("computables in polymorphics", () => {
    const q = e.select(e.Person, () => ({
      id: true,
      ...e.is(e.Hero, {
        secret_identity: true,
      }),
      ...e.is(e.Villain, {
        nemesis: { id: true, computable: e.int64(1234) },
        computable: e.int64(1234),
      }),
    }));

    type actual = $infer<typeof q>[number];
    type expected = {
      id: string;
    } & (
      | { __typename: "default::Hero"; secret_identity: string | null }
      | {
          __typename: "default::Villain";
          nemesis: { id: string; computable: 1234 } | null;
        }
    );
    tc.assert<tc.IsExact<actual, expected>>(true);
  });

  test("parent type props in polymorphic", () => {
    const q = e.select(e.Person, () => ({
      ...e.is(e.Hero, {
        // name is prop of Person
        name: true,
        secret_identity: true,
      }),
      ...e.is(e.Villain, { nemesis: { name: true } }),
    }));

    tc.assert<
      tc.IsExact<
        $infer<typeof q>,
        (
          | {
              __typename: "default::Hero";
              name: string;
              secret_identity: string | null;
            }
          | {
              __typename: "default::Villain";
              nemesis: { name: string } | null;
            }
        )[]
      >
    >(true);
  });

  test("* in polymorphic", async () => {
    const q = e.select(e.Person, () => ({
      ...e.is(e.Hero, e.Hero["*"]),
      name: true,
    }));
    type result = $infer<typeof q>;

    // 'id' is filtered out since it is not valid in a polymorphic expr
    tc.assert<
      tc.IsExact<
        result,
        ({ name: string } & (
          | { __typename: "default::Villain" }
          | {
              __typename: "default::Hero";
              height: string | null;
              age: number | null;
              isAdult: boolean | null;
              number_of_movies: number;
              secret_identity: string | null;
            }
        ))[]
      >
    >(true);

    await q.run(client);
  });

  test("shape type name", () => {
    const name = e.select(e.Hero).__element__.__name__;
    tc.assert<tc.IsExact<typeof name, "default::Hero">>(true);
  });

  test("polymorphic type names", () => {
    tc.assert<
      tc.IsExact<
        typeof e.LivingThing.__element__.__polyTypenames__,
        "default::Hero" | "default::Villain"
      >
    >(true);
    tc.assert<
      tc.IsExact<
        typeof e.Person.__element__.__polyTypenames__,
        "default::Hero" | "default::Villain"
      >
    >(true);
    tc.assert<
      tc.IsExact<typeof e.Hero.__element__.__polyTypenames__, "default::Hero">
    >(true);
  });

  test("limit/offset inference", () => {
    const testSet = e.set(1, 2, 3);

    tc.assert<
      tc.IsExact<(typeof testSet)["__cardinality__"], $.Cardinality.AtLeastOne>
    >(true);
    assert.deepEqual(testSet.__cardinality__, $.Cardinality.AtLeastOne);

    const r0 = e.select(testSet, () => ({}));
    tc.assert<
      tc.IsExact<(typeof r0)["__cardinality__"], $.Cardinality.AtLeastOne>
    >(true);
    assert.deepEqual(r0.__cardinality__, $.Cardinality.AtLeastOne);

    const r1 = e.select(testSet, () => ({ limit: 1 }));
    tc.assert<tc.IsExact<(typeof r1)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(r1.__cardinality__, $.Cardinality.Many);

    const r2 = e.select(testSet, () => ({ offset: 1 }));
    tc.assert<tc.IsExact<(typeof r2)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(r2.__cardinality__, $.Cardinality.Many);
  });

  test("offset", () => {
    const q = e.select(e.Hero, () => ({ name: true }));
    const r1 = e.select(q, () => ({ offset: 5 }));
    assert.equal(r1.__modifiers__.offset?.__element__.__name__, "std::number");
  });

  test("infer cardinality - scalar filters", () => {
    const q = e.select(e.Hero);
    const q2 = e.select(q, (hero) => ({
      filter_single: e.op(hero.name, "=", "asdf"),
    }));
    tc.assert<
      tc.IsExact<(typeof q2)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q2.__cardinality__, $.Cardinality.AtMostOne);

    const u3 = e.uuid("asdf");
    const q3 = e.select(q, (hero) => {
      return { filter_single: e.op(hero.id, "=", u3) };
    });
    tc.assert<
      tc.IsExact<(typeof q3)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q3.__cardinality__, $.Cardinality.AtMostOne);

    const q4 = q2.secret_identity;
    tc.assert<
      tc.IsExact<(typeof q4)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q4.__cardinality__, $.Cardinality.AtMostOne);

    const q5 = e.select(q, (hero) => ({
      filter: e.op(hero.secret_identity, "=", "asdf"),
    }));
    tc.assert<tc.IsExact<(typeof q5)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(q5.__cardinality__, $.Cardinality.Many);

    const q6 = e.select(e.Villain.nemesis, (nemesis) => ({
      filter_single: e.op(nemesis.name, "=", "asdf"),
    }));
    tc.assert<
      tc.IsExact<(typeof q6)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q6.__cardinality__, $.Cardinality.AtMostOne);

    const strs = e.set(e.str("asdf"), e.str("qwer"));
    const q7 = e.select(e.Villain, (villain) => ({
      filter: e.op(villain.name, "=", strs),
    }));
    tc.assert<tc.IsExact<(typeof q7)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(q7.__cardinality__, $.Cardinality.Many);

    const expr8 = e.select(e.Villain, () => ({ id: true, name: true }));
    const q8 = e.select(expr8, (villain) => ({
      filter_single: e.op(villain.name, "=", "asdf"),
    }));
    tc.assert<
      tc.IsExact<(typeof q8)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q8.__cardinality__, $.Cardinality.AtMostOne);

    const expr9 = e.select(e.Villain, () => ({ id: true, name: true }));
    const q9 = e.select(expr9, (villain) => ({
      filter_single: e.op(villain.name, "=", "asdf"),
    }));
    tc.assert<
      tc.IsExact<(typeof q9)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);
    assert.deepEqual(q9.__cardinality__, $.Cardinality.AtMostOne);
  });

  test("infer cardinality - object type filters", () => {
    const oneHero = e.select(e.Hero, () => ({ limit: 1 })).assert_single();

    const singleHero = e.select(e.Hero, (hero) => ({
      filter_single: e.op(hero, "=", oneHero),
    }));

    const c1 = singleHero.__cardinality__;
    tc.assert<tc.IsExact<typeof c1, $.Cardinality.AtMostOne>>(true);
    assert.deepEqual(c1, $.Cardinality.AtMostOne);

    const oneProfile = e.select(e.Hero, () => ({ limit: 1 })).assert_single();
    const singleMovie = e.select(e.Movie, (movie) => ({
      filter_single: e.op(movie.profile, "=", oneProfile),
    }));

    const c2 = singleMovie.__cardinality__;
    tc.assert<tc.IsExact<typeof c2, $.Cardinality.AtMostOne>>(true);
    assert.deepEqual(c2, $.Cardinality.AtMostOne);

    // not a singleton

    const c3 = e.select(e.Villain, (villain) => ({
      filter: e.op(villain.nemesis, "=", oneHero),
    })).__cardinality__;
    tc.assert<tc.IsExact<typeof c3, $.Cardinality.Many>>(true);
    assert.deepEqual(c3, $.Cardinality.Many);

    // not a singleton
    // technically a bug, but for now this behavior is expected
    const c4 = e.select(e.Villain, (villain) => ({
      filter_single: e.op(villain, "=", villain),
    })).__cardinality__;
    tc.assert<tc.IsExact<typeof c4, $.Cardinality.AtMostOne>>(true);
    assert.deepEqual(c4, $.Cardinality.AtMostOne);
  });

  test("non 'e.eq' filters", () => {
    const q1 = e.select(e.Hero, () => ({
      filter: e.bool(true),
    }));
    tc.assert<tc.IsExact<(typeof q1)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(q1.__cardinality__, $.Cardinality.Many);

    const q2 = e.select(e.Hero, (hero) => ({
      filter: e.op(true, "if", e.op(hero.name, "=", "Thanos"), "else", false),
    }));
    tc.assert<tc.IsExact<(typeof q2)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.deepEqual(q2.__cardinality__, $.Cardinality.Many);
  });

  test("fetch heroes", async () => {
    const result = await e.select(e.Hero).run(client);
    assert.equal(result.length, 3);
    assert.equal(
      result.every((h) => typeof h.id === "string"),
      true,
    );
  });

  test("filter by id", async () => {
    const result = await e
      .select(e.Hero, () => ({
        filter_single: { id: data.spidey.id },
      }))
      .run(client);

    assert.deepEqual(result?.id, data.spidey.id);
  });

  test("filter by id expr", async () => {
    const result = await e
      .select(e.Hero, () => ({
        filter_single: { id: e.uuid(data.spidey.id) },
      }))
      .run(client);

    assert.deepEqual(result?.id, data.spidey.id);
  });

  test("limit 1", async () => {
    const query = e
      .select(e.Hero, (hero) => ({
        order_by: hero.name,
        offset: 1,
        limit: 1,
      }))
      .assert_single();
    const result = await e.select(query).run(client);
    assert.deepEqual(result?.id, data.iron_man.id);
  });

  test("limit 2", async () => {
    const query = e.select(e.Hero, (hero) => ({
      order_by: hero.name,
      offset: 1,
      limit: 2,
    }));
    const results = await query.run(client);

    assert.equal(results.length, 2);
    assert.deepEqual(results, [
      { id: data.iron_man.id },
      { id: data.spidey.id },
    ]);
  });

  test("order by self", async () => {
    const query = e.select(e.Hero, (hero) => ({
      order_by: hero,
    }));
    const result = await query.run(client);
    assert.deepEqual(
      result,
      [data.cap, data.spidey, data.iron_man]
        .map((h) => ({ id: h.id }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  test("shapes", async () => {
    const query = e.select(
      e
        .select(e.Hero, (hero) => ({
          filter: e.op(hero.name, "=", "Iron Man"),
        }))
        .assert_single(),
      () => ({
        id: true,
        name: true,
        secret_identity: true,
        villains: { id: true },
      }),
    );

    const result = await query.run(client);
    assert.ok(result);
    assert.deepEqual(result, { ...result, ...data.iron_man });
    assert.deepEqual(result.villains, [{ id: data.thanos.id }]);
  });

  test("computables", async () => {
    const all_heroes = e.select(e.Hero, () => ({
      // __type__: {name: true}
      id: true,
    }));
    const query = e.select(
      e
        .select(e.Person.is(e.Hero), (hero) => ({
          order_by: hero.name,
          limit: 1,
        }))
        .assert_single(),
      () => ({
        id: true,
        computable: e.int64(35),
        all_heroes,
      }),
    );

    type query = $.setToTsType<typeof query>;
    tc.assert<
      tc.IsExact<
        query,
        {
          id: string;
          computable: 35;
          all_heroes: {
            // __type__: {name: string}
            id: string;
          }[];
        } | null
      >
    >(true);
    const results = await query.run(client);

    assert.deepEqual(results?.id, data.cap.id);
    assert.equal(results?.computable, 35);
  });

  test("type intersections", async () => {
    const query = e.select(e.Person.is(e.Hero), () => ({
      id: true,
      // __type__: {name: true},
    }));
    const results = await query.run(client);
    assert.equal(
      results.every((person) => typeof person.id === "string"),
      true,
    );
  });

  test("type intersections - static", () => {
    const result = e.select(e.Movie.characters).is(e.Villain);
    type result = $.setToTsType<typeof result>;
    tc.assert<tc.IsExact<result, { id: string }[]>>(true);
  });

  test("backlinks", async () => {
    const result1 = await e
      .select(e.Hero["<characters[is Movie]"], () => ({
        id: true,
        // __type__: {name: true},
        title: true,
      }))
      .run(client);

    const q2 = e.select(e.Hero["<characters"].is(e.Movie), () => ({
      id: true,
      // __type__: {name: true},
      title: true,
    }));

    const result2 = await q2.run(client);

    assert.deepEqual(result1, result2);
    assert.equal(Array.isArray(result1), true);
    assert.equal(
      [data.the_avengers.title, data.civil_war.title].includes(
        result1[0].title,
      ),
      true,
    );

    const q3 = e.select(e.Hero, (hero) => ({
      "<characters[is Movie]": {
        title: true,
      },
      starredIn: e.select(hero["<characters[is Movie]"], () => ({
        title: true,
      })),
    }));

    const res3 = await q3.run(client);
    tc.assert<
      tc.IsExact<
        typeof res3,
        {
          "<characters[is Movie]": { title: string }[];
          starredIn: { title: string }[];
        }[]
      >
    >(true);

    for (const hero of res3) {
      assert.deepEqual(hero["<characters[is Movie]"], hero.starredIn);
    }
  });

  test("overrides with implicit casting", () => {
    e.select(e.Hero, () => ({
      id: e.uuid("asdf"),
      number_of_movies: e.int64(1234),
      name: e.str("adsf"),
    }));
  });

  test("link properties", async () => {
    const query = e.select(e.Movie, () => ({
      id: true,
      characters: () => ({
        name: true,
        "@character_name": true,
      }),
    }));

    const result = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          id: string;
          characters: {
            name: string;
            "@character_name": string | null;
          }[];
        }[]
      >
    >(true);
  });

  test("link properties in expressions", async () => {
    const query = e.select(e.Movie, () => ({
      id: true,
      characters: (char) => ({
        name: true,
        "@character_name": true,
        char_name: char["@character_name"],
        person_name: char.name,

        filter: e.op(char["@character_name"], "ilike", "a%"),
      }),
    }));

    const result = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          id: string;
          characters: {
            name: string;
            "@character_name": string | null;
            char_name: string | null;
            person_name: string;
          }[];
        }[]
      >
    >(true);
  });

  test("polymorphic link properties in expressions", async () => {
    const query = e.select(e.Object, () => ({
      id: true,
      ...e.is(e.Movie, {
        title: true,
        characters: (char) => ({
          name: true,
          "@character_name": true,
          char_name: char["@character_name"],
          person_name: char.name,

          filter: e.op(char["@character_name"], "ilike", "a%"),
        }),
      }),
    }));

    const result = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        ({
          id: string;
        } & (
          | {
              __typename: Exclude<
                typeof e.Object.__element__.__polyTypenames__,
                "default::Movie"
              >;
            }
          | {
              __typename: "default::Movie";
              title: string;
              characters: {
                name: string;
                "@character_name": string | null;
                char_name: string | null;
                person_name: string;
              }[];
            }
        ))[]
      >
    >(true);
  });

  // test("assert_single this check", () => {
  //   const inner = e.select(e.Hero);
  //   const outer = e.select(e.Hero).assert_single().__args__[0];
  //   tc.assert<tc.IsExact<typeof inner, typeof outer>>(true);
  // });

  test("filters in subqueries", async () => {
    const q1 = e.select(e.Hero, (hero) => ({
      name: true,
      villains: {
        id: true,
        name: true,
      },
      filter_single: e.op(hero.name, "=", data.spidey.name),
    }));

    const res1 = await q1.run(client);

    tc.assert<
      tc.IsExact<
        typeof res1,
        {
          name: string;
          villains: {
            id: string;
            name: string;
          }[];
        } | null
      >
    >(true);

    assert.ok(res1);
    assert.equal(res1.villains.length, 1);

    const q2 = e.select(e.Hero, (hero) => ({
      name: true,
      villains: (v) => ({
        id: true,
        name: true,
        filter: e.op(v.name, "ilike", "%n%"),
      }),
      filter_single: e.op(hero.name, "=", data.spidey.name),
    }));

    const res2 = await q2.run(client);

    assert.ok(res2);
    assert.equal(res2.villains.length, 0);

    tc.assert<tc.IsExact<typeof res1, typeof res2>>(true);

    const q3 = e.select(e.Hero, (hero) => ({
      name: true,
      villains: (v) => ({
        id: true,
        name: true,
        filter: e.op(v.name, "=", "Thanos"),
      }),
      thanos: e.select(hero.villains, (v) => ({
        name: true,
        filter_single: e.op(v.name, "=", "Thanos"),
      })),
    }));

    await e
      .select(e.Hero.villains, (v) => ({
        name: true,
        filter: e.op(v.name, "=", "Thanos"),
      }))
      .run(client);

    const res3 = await q3.run(client);

    assert.equal(Array.isArray(res3), true);
    const ironMan = res3.find((r) => r.name === "Iron Man");
    assert.ok(ironMan);
    assert.equal(Array.isArray(ironMan.villains), true);
    assert.equal(Array.isArray(ironMan.thanos), false);

    tc.assert<
      tc.IsExact<
        typeof res3,
        /**
       * onst res3:
  {
    name: string;
    villains: {
        id: string;
        name: string;
    }[];
    thanos: {
        name: string | undefined;
    } | null;
  }[]
       */
        {
          name: string;
          villains: {
            id: string;
            name: string;
          }[];
          thanos: {
            name: string;
          } | null;
        }[]
      >
    >(true);
  });

  test("repeated computed", async () => {
    const query = e.select(e.Villain, () => ({
      id: true,
      name: true,
      nemesis: (nemesis) => {
        const nameLen = e.len(nemesis.name);
        return {
          name: true,
          nameLen,
          nameLen2: nameLen,
        };
      },
    }));

    assert.equal(
      query.toEdgeQL(),
      `WITH
  __scope_0_defaultVillain := DETACHED default::Villain
SELECT __scope_0_defaultVillain {
  id,
  name,
  nemesis := (
    WITH
      __scope_1_defaultHero_expr := __scope_0_defaultVillain.nemesis,
      __scope_1_defaultHero := (FOR __scope_1_defaultHero_inner IN {__scope_1_defaultHero_expr} UNION (
        WITH
          __withVar_2 := std::len(__scope_1_defaultHero_inner.name)
        SELECT __scope_1_defaultHero_inner {
          __withVar_2 := __withVar_2
        }
      ))
    SELECT __scope_1_defaultHero {
      name,
      single nameLen := __scope_1_defaultHero.__withVar_2,
      single nameLen2 := __scope_1_defaultHero.__withVar_2
    }
  )
}`,
    );

    const res = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof res,
        {
          id: string;
          name: string;
          nemesis: {
            name: string;
            nameLen: number;
            nameLen2: number;
          } | null;
        }[]
      >
    >(true);
  });

  test("polymorphic subqueries", async () => {
    const query = e.select(e.Movie.characters, () => ({
      id: true,
      name: true,
      ...e.is(e.Villain, { nemesis: true }),
      ...e.is(e.Hero, {
        secret_identity: true,
        villains: {
          id: true,
          name: true,
          nemesis: (nemesis) => {
            const nameLen = e.len(nemesis.name);
            return {
              t: nemesis.__type__.name,
              name: true,
              nameLen,
              nameLen2: nameLen,
            };
          },
        },
      }),
    }));

    assert.equal(
      query.toEdgeQL(),
      `WITH
  __scope_0_defaultPerson := DETACHED default::Movie.characters
SELECT __scope_0_defaultPerson {
  id,
  name,
  [IS default::Villain].nemesis,
  [IS default::Hero].secret_identity,
  multi villains := (
    WITH
      __scope_1_defaultVillain := __scope_0_defaultPerson[IS default::Hero].villains
    SELECT __scope_1_defaultVillain {
      id,
      name,
      nemesis := (
        WITH
          __scope_2_defaultHero_expr := __scope_1_defaultVillain.nemesis,
          __scope_2_defaultHero := (FOR __scope_2_defaultHero_inner IN {__scope_2_defaultHero_expr} UNION (
            WITH
              __withVar_3 := std::len(__scope_2_defaultHero_inner.name)
            SELECT __scope_2_defaultHero_inner {
              __withVar_3 := __withVar_3
            }
          ))
        SELECT __scope_2_defaultHero {
          single t := __scope_2_defaultHero.__type__.name,
          name,
          single nameLen := __scope_2_defaultHero.__withVar_3,
          single nameLen2 := __scope_2_defaultHero.__withVar_3
        }
      )
    }
  ),
  __typename := .__type__.name
}`,
    );

    const res = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof res,
        ({
          id: string;
          name: string;
        } & (
          | {
              __typename: "default::Villain";
              nemesis: { id: string } | null;
            }
          | {
              __typename: "default::Hero";
              secret_identity: string | null;
              villains: {
                id: string;
                name: string;
                nemesis: {
                  t: "default::Hero";
                  name: string;
                  nameLen: number;
                  nameLen2: number;
                } | null;
              }[];
            }
        ))[]
      >
    >(true);
  });

  test("polymorphic with explicit __typename is not duplicated", async () => {
    const query = e.select(e.Movie.characters, (person) => ({
      __typename: person.__type__.name,
      ...e.is(e.Villain, { nemesis: true }),
    }));

    assert.equal(
      query.toEdgeQL(),
      `WITH
  __scope_0_defaultPerson := DETACHED default::Movie.characters
SELECT __scope_0_defaultPerson {
  single __typename := __scope_0_defaultPerson.__type__.name,
  [IS default::Villain].nemesis
}`,
    );
  });

  test.skip("polymorphic from type intersection", async () => {
    const query = e.select(e.Movie.characters, (person) => ({
      heroMovieCount: person.is(e.Hero).number_of_movies,
      heroInfo: e.select(person.is(e.Hero), (hero) => ({
        number_of_movies: true,
        numMovies: hero.number_of_movies,
      })),
    }));
    type result = $infer<typeof query>;
    tc.assert<
      tc.IsExact<
        result,
        (
          | {
              __typename: "default::Villain";
            }
          | {
              __typename: "default::Hero";
              heroMovieCount: number;
              heroInfo: {
                number_of_movies: number;
                numMovies: number;
              };
            }
        )[]
      >
    >(false);
  });

  test("polymorphic field in nested shape", async () => {
    const query = e.select(e.Movie, (movie) => ({
      title: true,
      characters: (char) => ({
        name: true,
        order_by: char.name, // assert order by scalar
        ...e.is(e.Hero, { secret_identity: true }),
      }),
      filter_single: e.op(movie.title, "=", "The Avengers"),
      order_by: movie.genre, // assert order by enum
    }));

    const result = await query.run(client);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      title: data.the_avengers.title,
      characters: [
        {
          __typename: "default::Hero",
          name: data.cap.name,
          secret_identity: data.cap.secret_identity,
        },
        {
          __typename: "default::Hero",
          name: data.iron_man.name,
          secret_identity: data.iron_man.secret_identity,
        },
      ],
    });

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          title: string;
          characters: ({
            name: string;
          } & (
            | { __typename: "default::Villain" }
            | {
                __typename: "default::Hero";
                secret_identity: string | null;
              }
          ))[];
        } | null
      >
    >(true);
  });

  test("correlated path select", async () => {
    const query = e.select(
      e.op(e.op(e.Hero.name, "++", " is "), "++", e.Hero.secret_identity),
    );

    const correlatedQuery = e.with([e.Hero], query);

    const heros = [data.cap, data.iron_man, data.spidey];

    assert.deepEqual(
      (await query.run(client)).sort(),
      $.util
        .flatMap(heros, (h1) =>
          heros.map((h2) => `${h1.name} is ${h2.secret_identity}`),
        )
        .sort(),
    );

    assert.deepEqual(
      (await correlatedQuery.run(client)).sort(),
      heros.map((h) => `${h.name} is ${h.secret_identity}`).sort(),
    );
  });

  test("modifiers on scalar selects", async () => {
    // filter
    const q1 = e.select(e.Hero.name, (el) => ({
      filter: e.op(el, "ilike", "%man%"),
    }));
    const res1 = await q1.run(client);
    tc.assert<tc.IsExact<typeof res1, string[]>>(true);
    assert.deepEqual(
      res1.sort(),
      [data.iron_man.name, data.spidey.name].sort(),
    );

    // order
    const unorderedSet = e.set(
      e.int64(2),
      e.int64(4),
      e.int64(1),
      e.int64(5),
      e.int64(3),
    );

    const q2 = e.select(unorderedSet, (el) => ({
      order_by: el,
    }));
    const res2 = await q2.run(client);
    tc.assert<tc.IsExact<typeof res2, [number, ...number[]]>>(true);
    assert.deepEqual(res2, [1, 2, 3, 4, 5]);

    const q3 = e.select(unorderedSet, (el) => ({
      order_by: { expression: el, direction: e.DESC },
    }));
    const res3 = await q3.run(client);
    tc.assert<tc.IsExact<typeof res3, [number, ...number[]]>>(true);
    assert.deepEqual(res3, [5, 4, 3, 2, 1]);

    // offset and limit
    const q4 = e
      .select(unorderedSet, () => ({
        offset: 2,
        limit: 1,
      }))
      .assert_single();
    const res4 = await e.select(q4).run(client);
    tc.assert<tc.IsExact<typeof res4, number | null>>(true);
    assert.equal(res4, 1);
  });

  test("overriding pointers", async () => {
    const q = e.select(e.Hero, () => ({
      height: e.decimal("10.0"),
    }));
    type Height = $infer<typeof q.__element__.__shape__.height>;
    type Q = $infer<typeof q>;
    tc.assert<
      tc.IsExact<
        Q,
        {
          height: Height;
        }[]
      >
    >(true);

    await assert.rejects(
      async () =>
        e
          // @ts-expect-error cannot assign multi cardinality if point is single
          .select(e.Hero, () => ({
            height: e.set(e.decimal("10.0"), e.decimal("11.0")),
          }))
          .run(client),
      (err) => {
        if (
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof err.message === "string"
        ) {
          assert.match(err.message, /possibly more than one element returned/);
          return true;
        } else {
          assert.fail("Expected error to be an object with a message");
        }
      },
    );
  });

  test("coalescing pointers", () => {
    const q = e.select(e.Hero, (h) => ({
      height: e.op(h.height, "??", e.decimal("10.0")),
    }));
    type Height = $infer<typeof q.__element__.__shape__.height>;
    type Q = $infer<typeof q>;
    tc.assert<
      tc.IsExact<
        Q,
        {
          height: Height;
        }[]
      >
    >(true);
  });

  test("nested matching scopes", async () => {
    const q = e.select(e.Hero, (h) => ({
      name: h.name,
      otherHeros: e.select(e.Hero, (h2) => ({
        name: true,
        name_one: h.name,
        name_two: h2.name,
        names_match: e.op(h.name, "=", h2.name),
        order_by: h2.name,
      })),
      order_by: h.name,
    }));

    const result = await q.run(client);

    const heros = [data.cap, data.iron_man, data.spidey];

    const expectedResult = heros.map((h) => ({
      name: h.name,
      otherHeros: heros.map((h2) => ({
        name: h2.name,
        name_one: h.name,
        name_two: h2.name,
        names_match: h.name === h2.name,
      })),
    }));

    assert.deepEqual(JSON.stringify(result), JSON.stringify(expectedResult));
  });

  test("runnable expressions", async () => {
    const expr = e.op("Hello ", "++", "World");

    assert.equal(await expr.run(client), `Hello World`);
  });

  test("computed property path", async () => {
    const numbers = e.set(1, 2, 3);
    const expr = e.select({
      numbers,
    });
    const query = e.select(expr.numbers);

    assert.deepEqual(await query.run(client), [1, 2, 3]);
  });

  test("select with enums", async () => {
    const query = e.select(e.Movie, (movie) => ({
      title: true,
      genre: true,
      filter: e.op(movie.genre, "=", e.Genre.Action),
    }));
    const result = await query.run(client);
    assert.equal(result.length, 2);
  });

  test("filter by sequence", async () => {
    await e.op(e.Bag.seqField, "=", 1).run(client);
  });

  test("Date type", async () => {
    const dates = await e.select(e.Bag.datetimeField).run(client);
    tc.assert<tc.IsExact<typeof dates, Date[]>>(true);
  });

  test("select *", async () => {
    const allFields = await e
      .select(e.Movie, (movie) => ({
        ...e.Movie["*"],
        filter: e.op(movie.title, "=", data.the_avengers.title),
      }))
      .run(client);

    const { characters: _characters, ...movie } = data.the_avengers;
    assert.deepEqual(allFields, [movie]);
  });

  test("select required multi link", async () => {
    const query = e.select(e.User, () => ({
      username: true,
      favourite_movies: {
        title: true,
      },
    }));

    await query.run(client);
  });

  test("filter on link prop", async () => {
    const query = e.select(e.Movie, () => ({
      title: true,
      characters: (c) => ({
        name: true,
        "@character_name": true,
        filter: e.op(c["@character_name"], "=", "Tony Stark"),
      }),
    }));
    await query.run(client);
  });

  test("filter on link prop in nested path", async () => {
    const query = e.select(e.Movie, (movie) => ({
      filter: e.op("Iron Man", "in", movie.characters["@character_name"]),
      title: true,
    }));
    await query.run(client);
  });

  test("cardinality of linkprop in scopified object", async () => {
    const query = e.select(e.Movie.characters, (c) => {
      assert.deepEqual(
        c["@character_name"].__cardinality__,
        $.Cardinality.AtMostOne,
      );
      return {
        name: true,
        // doesn't work yet
        // ["@character_name"]: true,
      };
    });
    await query.run(client);
  });

  test("portable shape", async () => {
    const baseShape = e.shape(e.Movie, (movie) => ({
      __typename: movie.__type__.name,
      title: true,
      rating: true,
      filter_single: e.op(movie.title, "=", "The Avengers"),
    }));
    const characterShape = e.shape(e.Person, () => ({
      name: true,
      id: true,
    }));
    const personShape = e.shape(e.Person, () => ({
      name: true,
    }));
    const villainShape = e.shape(e.Villain, () => ({
      nemesis: true,
    }));
    const profileShape = e.shape(e.Profile, () => ({
      slug: true,
    }));

    type ShapeType = $infer<typeof baseShape>;
    tc.assert<
      tc.IsExact<
        ShapeType,
        {
          __typename: "default::Movie";
          title: string;
          rating: number | null;
        } | null
      >
    >(true);

    type CharacterShapeType = $infer<typeof characterShape>;
    tc.assert<tc.IsExact<CharacterShapeType, { name: string; id: string }[]>>(
      true,
    );

    const query = e.select(e.Movie, (m) => {
      return {
        ...baseShape(m),
        characters: characterShape,
        profile: profileShape,
      };
    });
    assert.equal(
      (query.__element__.__shape__.profile as any).__cardinality__,
      $.Cardinality.AtMostOne,
    );
    type Q = $infer<typeof query>;

    tc.assert<
      tc.IsExact<
        Q,
        {
          __typename: "default::Movie";
          title: string;
          rating: number | null;
          characters: {
            id: string;
            name: string;
          }[];
          profile: {
            slug: string | null;
          } | null;
        } | null
      >
    >(true);

    const result = await query.run(client);
    assert.ok(result);
    assert.ok(result.title);
    assert.ok(result.rating);
    assert.ok(result.characters);

    const cast = e.select(query, () => ({ characters: true }));
    const freeObjWithShape = e.select({
      heros: e.select(cast.characters.is(e.Hero), personShape),
      villains: e.select(cast.characters.is(e.Villain), villainShape),
    });
    type FreeObjWithShape = $infer<typeof freeObjWithShape>;
    tc.assert<
      tc.IsExact<
        FreeObjWithShape,
        {
          heros: { name: string }[];
          villains: { nemesis: { id: string } | null }[];
        }
      >
    >(true);
    assert.ok(freeObjWithShape);
  });

  test("filter_single id", async () => {
    const query = e.select(e.Movie, () => ({
      title: true,
      filter_single: { title: "The Avengers" },
    }));
    const result = await query.run(client);
    assert.equal(result?.title, "The Avengers");
  });

  test("filter_single exclusive prop", async () => {
    const query = e.select(e.Movie, () => ({
      title: true,
      filter_single: { title: "The Avengers" },
    }));
    const result = await query.run(client);
    assert.equal(result?.title, "The Avengers");
  });

  test("filter_single composite", async () => {
    const query = e.select(e.Movie, () => ({
      title: true,
      filter_single: { title: "The Avengers", release_year: 2012 },
    }));
    const result = await query.run(client);
    assert.equal(result?.title, "The Avengers");
  });

  test("filter_single composite truple", async () => {
    const query = e.select(e.Profile, () => ({
      slug: true,
      filter_single: {
        a: "adsf",
        b: "adsf",
        c: "adsf",
      },
    }));

    await query.run(client);
  });

  test("filter_single expect error", async () => {
    // @ts-expect-error filter_single only types exclusive props
    e.select(e.Movie, () => ({
      title: true,
      filter_single: { genre: e.Genre.Horror },
    }));
  });

  test("filter_single card mismatch", async () => {
    const query = e.select(e.Movie, (movie) => ({
      title: true,
      filter_single: e.op(movie.genre, "=", e.Genre.Action),
    }));

    assert.rejects(() => query.run(client), gel.CardinalityViolationError);
  });

  test("type union links", async () => {
    const query = e.select(e.Z, () => ({
      xy: {
        a: true,
        ...e.is(e.X, {
          b: true,
        }),
      },
    }));

    const result = await query.run(client);

    type Result = typeof result;

    tc.assert<
      tc.IsExact<
        Result,
        {
          xy:
            | ({ a: string | null } & (
                | { __typename: "default::W" | "default::Y" }
                | {
                    __typename: "default::X";
                    b: number | null;
                  }
              ))
            | null;
        }[]
      >
    >(true);
  });

  test("Reference default type and module with same name", async () => {
    const query = e.select(e.User, () => ({
      active: e.User.Status.Active,
    }));
    await query.run(client);
  });

  test("False shape pointers are not returned", () => {
    const q = e.select(e.Movie, () => ({
      title: true,
      rating: true,
      genre: false,
    }));

    tc.assert<
      tc.IsExact<
        $infer<typeof q>,
        {
          title: string;
          rating: number | null;
        }[]
      >
    >(true);
  });

  test("Select assignment works", () => {
    const q = e.select(e.Person, () => ({
      name: true,
      isAdult: e.bool(false),
    }));

    tc.assert<
      tc.IsExact<
        $infer<typeof q>,
        {
          name: string;
          isAdult: false;
        }[]
      >
    >(true);
  });

  test("select json literal", async () => {
    const q = e.select({
      jsonLiteral: e.json("$jsonliteral$delete Person"),
    });

    const result = await q.run(client);
    assert.deepEqual(result, { jsonLiteral: "$jsonliteral$delete Person" });
  });

  test("select json literal: counter overflow", async () => {
    let testString = "$jsonliteral$";
    for (let i = 0; i < 100; i++) {
      testString += `$jsonliteral${i}$`;
    }
    const q = e.select(e.json(testString));

    assert.rejects(() => q.run(client), gel.InputDataError);
  });

  test("arbitrary json literal", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (arbitraryJson) => {
        const roundTripped = JSON.parse(JSON.stringify(arbitraryJson));
        const result = await e.select(e.json(arbitraryJson)).run(client);
        assert.deepEqual(result, roundTripped);
      }),
    );
  });

  test("json literal special case: -0 is 0 in JSON", async () => {
    const result = await e.select(e.json(-0)).run(client);
    assert.equal(result, 0);
  });

  test("select using scoped expr directly (not a field/path on that scoped expr)", async () => {
    const query = e.select(
      e.select(e.Movie, (movie) => ({
        filter: e.op(movie.title, "=", "Dune"),
      })),
      (movie) => ({
        comp: movie.is(e.Movie),
      }),
    );
    await query.run(client);

    const user = e.select(e.User, () => ({
      filter_single: { id: "4d0f90b1-de94-4c79-ba56-3e0acdfbd06d" },
    }));
    const movies = e.select(user.favourite_movies, (movie) => ({
      filter: e.op(movie.title, "=", user.username),
    }));
    const query2 = e.with(
      [user, movies],
      e.select(movies, (movie) => ({
        isFav: e.op(movie, "in", user.favourite_movies),
      })),
    );

    await query2.run(client);
  });

  test("assert_single wrapped select as expr in e.with", async () => {
    const movies = e.select(e.Movie, () => ({
      title: true,
    }));

    const query = e.with(
      [movies],
      e.select(e.User, (user) => ({
        // use filter_single with e.op to force select to be wrapped in assert_single
        filter_single: e.op(
          user.id,
          "=",
          e.uuid("4d0f90b1-de94-4c79-ba56-3e0acdfbd06d"),
        ),
        username: true,
        some_movies: movies,
      })),
    );

    await query.run(client);
  });
});
