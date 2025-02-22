import assert from "node:assert/strict";
import type * as gel from "gel";

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
            name: string;

            __type__: {
              id: string;
              __type__: {
                id: string;
                name: string;
              };
            };
          };
        }[]
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
          secret_identity: string | null;
          nemesis: {
            name: string;
          } | null;
        }
      >
    >(true);
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
    interface expected {
      id: string;
      secret_identity: string | null;
      nemesis: { id: string; computable: 1234 } | null;
    }
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
        {
          name: string | null;
          secret_identity: string | null;
          nemesis: { name: string } | null;
        }[]
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
        {
          name: string;
          age: number | null;
          height: string | null;
          isAdult: boolean | null;
          secret_identity: string | null;
          number_of_movies: number | null;
        }[]
      >
    >(true);

    await q.run(client);
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
        {
          id: string;
          title: string | null;
          characters:
            | {
                name: string;
                "@character_name": string | null;
                char_name: string | null;
                person_name: string;
              }[]
            | null;
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
            id: string;
          } | null;
          secret_identity: string | null;
          villains:
            | {
                id: string;
                name: string;
                nemesis: {
                  name: string;
                  t: string;
                  nameLen: number;
                  nameLen2: number;
                } | null;
              }[]
            | null;
        }[]
      >
    >(true);
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
          name: data.cap.name,
          secret_identity: data.cap.secret_identity,
        },
        {
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
          characters: {
            name: string;
            secret_identity: string | null;
          }[];
        } | null
      >
    >(true);
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
          __typename: string;
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
          __typename: string;
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
          xy: {
            a: string | null;
            b: number | null;
          } | null;
        }[]
      >
    >(true);
  });
});
