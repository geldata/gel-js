import assert from "node:assert/strict";
import { type Client, $ } from "gel";
import type { Villain } from "./dbschema/edgeql-js/modules/default";
import type { InsertShape } from "./dbschema/edgeql-js/insert";
import e from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc } from "./setupTeardown";

describe("insert", () => {
  let client: Client;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("insert shape check", async () => {
    type insertVillainShape = InsertShape<(typeof Villain)["__element__"]>;
    const c1 = { name: e.str("adf") };
    tc.assert<tc.Has<typeof c1, insertVillainShape>>(true);
  });

  test("basic insert", async () => {
    const q1 = e.insert(e.Movie, {
      title: "Black Widow",
      genre: e.Genre.Action,
      rating: 5,
    });

    assert.deepEqual(q1.__cardinality__, $.Cardinality.One);
    tc.assert<tc.IsExact<(typeof q1)["__cardinality__"], $.Cardinality.One>>(
      true,
    );

    await q1.run(client);
    await client.execute(`DELETE Movie FILTER .title = 'Black Widow';`);
  });

  test("insert with keyword enum", async () => {
    const q1 = e.insert(e.Movie, {
      title: "A fine selection",
      genre: e.Genre.Select,
      rating: 2,
    });

    await q1.run(client);
    await e
      .delete(e.Movie, (movie) => ({
        filter: e.op(movie.title, "=", "A fine selection"),
      }))
      .run(client);
    await client.execute(`DELETE Movie FILTER .title = 'A fine selection';`);
  });

  test("unless conflict", async () => {
    const q0 = e
      .insert(e.Movie, {
        title: "The Avengers",
        rating: 11,
      })
      .unlessConflict();

    assert.deepEqual(q0.__cardinality__, $.Cardinality.AtMostOne);
    tc.assert<
      tc.IsExact<(typeof q0)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);

    const q1 = e
      .insert(e.Movie, {
        title: "The Avengers",
        rating: 11,
      })
      .unlessConflict((movie) => ({
        on: movie.title,
      }));

    assert.deepEqual(q1.__cardinality__, $.Cardinality.AtMostOne);
    tc.assert<
      tc.IsExact<(typeof q1)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);

    const r1 = await q1.run(client);
    tc.assert<tc.IsExact<typeof r1, { id: string } | null>>(true);

    assert.equal(r1, null);

    const q2 = e
      .insert(e.Movie, {
        title: "The Avengers",
        rating: 11,
      })
      .unlessConflict((movie) => ({
        on: movie.title,
        else: e.update(movie, () => ({
          set: {
            rating: 11,
          },
        })),
      }));

    const r2 = await q2.run(client);

    const allMovies = await e
      .select(e.Movie, () => ({ id: true, title: true, rating: true }))
      .run(client);

    for (const movie of allMovies) {
      if (movie.title === "The Avengers") {
        assert.equal(movie.rating, 11);
        assert.deepEqual(r2.id, movie.id);
      } else {
        assert.notDeepEqual(movie.rating, 11);
      }
    }

    const q3 = e
      .insert(e.Movie, {
        title: "The Avengers",
        rating: 11,
      })
      .unlessConflict((movie) => ({
        on: movie.title,
        else: e.select(e.Hero, () => ({ name: true })),
      }));

    assert.deepEqual(q3.__cardinality__, $.Cardinality.Many);
    tc.assert<tc.IsExact<(typeof q3)["__cardinality__"], $.Cardinality.Many>>(
      true,
    );
    assert.equal(q3.__element__.__name__, "std::Object");
    tc.assert<
      tc.IsExact<(typeof q3)["__element__"]["__name__"], "std::Object">
    >(true);

    const r3 = await q3.run(client);

    tc.assert<tc.IsExact<typeof r3, { id: string }[]>>(true);
  });

  test("with wrapping insert .unlessConflict()", async () => {
    const dep = e
      .insert(e.Person, {
        name: "dependency",
      })
      .unlessConflict((person) => ({
        on: person.name,
        else: person,
      }));

    const query = e.with(
      [dep], // dependency used inside the insert expression
      e.select(e.int16(42)),
    );

    // The presence of `.unlessConflict()` should make the result AtMostOne
    assert.deepEqual(query.__cardinality__, $.Cardinality.AtMostOne);
    tc.assert<
      tc.IsExact<(typeof query)["__cardinality__"], $.Cardinality.AtMostOne>
    >(true);

    const result = await query.run(client);
    // Type of the result should be `{id: string} | null`
    tc.assert<tc.IsExact<typeof result, { id: string } | null>>(true);
    assert.ok(result?.id);
  });

  test("nested insert", async () => {
    const q1 = e.insert(e.Villain, {
      name: e.str("villain"),
      nemesis: e.insert(e.Hero, {
        name: "hero",
      }),
    });

    const q2 = e.select(q1, () => ({
      name: true,
      nemesis: { name: true },
    }));

    const result = await q2.run(client);

    assert.deepEqual(result, {
      ...result,
      name: "villain",
      nemesis: {
        ...result.nemesis,
        name: "hero",
      },
    });

    // cleanup
    await client.execute(`delete Villain filter .name = '${result.name}';`);
    await client.execute(
      `delete Hero filter .name = '${result.nemesis.name}';`,
    );
    return;
  });

  test("insert type enforcement", async () => {
    e.insert(e.Villain, {
      // @ts-expect-error card mismatch
      nemesis: e.select(e.Hero),
    });

    // @ts-expect-error missing required field
    e.insert(e.Villain, {});

    e.insert(e.Villain, {
      name: e.cast(e.str, e.set()),
    });

    e.insert(e.Hero, {
      // @ts-expect-error testing invalid type
      name: 1234,
      // @ts-expect-error testing invalid type
      number_of_movies: "Ronin",
    });

    // should not error on missing required prop 'release_year'
    // since it has a default value
    e.insert(e.Movie, {
      title: "test_movie",
    });

    e.insert(e.Movie, {
      title: "test movie",
      rating: null,
      profile: null,
      // @ts-expect-error release_year is required prop
      release_year: null,
    }).toEdgeQL();

    e.insert(e.User, {
      username: "spidey",
      favourite_movies: e.select(e.Movie, (movie) => ({
        filter: e.op(movie.title, "=", "The Avengers"),
      })),
    });

    return;
  });

  test("optional sequence fields", async () => {
    const query = e.insert(e.Bag, {
      stringsMulti: "asdf",
    });
    await query.run(client);
  });

  test("complex raw data in inserts", async () => {
    const strings = ["aaa", "bbb"];
    const query = e.insert(e.Bag, {
      stringsArr: strings,
      stringsMulti: strings as ["aaa", "bbb"],
      stringMultiArr: [strings],
      boolField: true,
    });
    const final = e.select(query, () => ({
      id: true,
      stringsMulti: true,
      stringsArr: true,
      stringMultiArr: true,
      boolField: true,
    }));
    const result = await final.run(client);
    assert.deepEqual(result, {
      ...result,
      stringsMulti: strings,
      stringsArr: strings,
      stringMultiArr: [strings],
      boolField: true,
    });

    e.insert(e.Bag, {
      // @ts-expect-error must be string or non-empty array of strings
      stringsMulti: strings,
    });
  });

  test("insert readonly prop", async () => {
    const iq = e.insert(e.Profile, {
      slug: "movieslug",
      plot_summary: "Stuff happens.",
    });

    const qq = e.select(iq, () => ({
      slug: true,
      plot_summary: true,
    }));

    const result = await qq.run(client);
    assert.deepEqual(result, {
      ...result,
      slug: "movieslug",
      plot_summary: "Stuff happens.",
    });
  });

  test("exclude readonly props", () => {
    type insertProfileShape = InsertShape<(typeof e)["Profile"]["__element__"]>;
    tc.assert<
      "plot_summary" | "slug" extends keyof insertProfileShape ? true : false
    >(true);
  });

  test("insert link prop in nested select", async () => {
    const inserted = e.insert(e.Movie, {
      title: "Iron Man 3",
      release_year: 2013,
      characters: e.select(e.Hero, (hero) => ({
        filter: e.op(hero.name, "=", "Iron Man"),
        "@character_name": e.str("Tony Stark"),
      })),
    });

    const selected = e.select(inserted, () => ({
      characters: {
        name: true,
        "@character_name": true,
      },
    }));

    const result = await selected.run(client);
    assert.equal(result.characters[0]["@character_name"], "Tony Stark");
    assert.equal(result.characters[0].name, "Iron Man");
  });

  test("insert link prop in nested insert", async () => {
    const inserted = e.insert(e.Movie, {
      title: "Iron Man 2",
      release_year: 2010,
      characters: e.insert(e.Villain, {
        name: "Whiplash",
        "@character_name": e.str("Ivan Vanko"),
      }),
    });

    const selected = e.select(inserted, () => ({
      characters: {
        name: true,
        "@character_name": true,
      },
    }));

    const result = await selected.run(client);
    assert.equal(result.characters[0]["@character_name"], "Ivan Vanko");
    assert.equal(result.characters[0].name, "Whiplash");
  });

  test("no plain data as link prop", async () => {
    assert.throws(() =>
      e.insert(e.Movie, {
        title: "Guardians",
        release_year: 2014,
        characters: e.insert(e.Hero, {
          name: "Star-Lord",
          "@character_name": "Peter Quill",
        }),
      }),
    );
  });

  test("undefined in insert", async () => {
    const result = await e
      .insert(e.Movie, {
        title: "The Eternals",
        release_year: undefined,
      })
      .run(client);
    assert.ok(result.id);
  });

  test("invalid insert", async () => {
    assert.throws(() =>
      e
        // @ts-expect-error testing invalid type
        .insert(e.Movie, () => ({
          title: "Invalid",
        }))
        .toEdgeQL(),
    );
  });

  test("empty shape insert", async () => {
    const res = await e.insert(e.Profile, {}).run(client);

    assert.deepEqual(Object.keys(res), ["id"]);
  });

  test("insert custom ID", async () => {
    await e
      .insert(e.Hero, {
        id: "00000000-0000-0000-0000-000000000000",
        name: "asdf",
      })
      .run(client);

    await e
      .delete(e.Hero, (hero) => ({
        filter: e.op(
          hero.id,
          "=",
          e.uuid("00000000-0000-0000-0000-000000000000"),
        ),
      }))
      .run(client);
  });

  test("empty arrays for array and multi properties", async () => {
    const query = e.insert(e.Bag, {
      stringsMulti: ["asdf"],
      stringMultiArr: [],
      stringsArr: [],
    });
    await query.run(client);
  });

  test("readonly arrays for array and multi properties", async () => {
    const items: readonly string[] = ["asdf"];
    const query = e.insert(e.Bag, {
      stringsMulti: ["asdf", ...items] as const,
      stringMultiArr: [items] as const,
      stringsArr: items,
    });
    await query.run(client);
  });

  test("insert named tuple as shape", async () => {
    const query = e.params(
      {
        profiles: e.array(
          e.tuple({
            a: e.str,
            b: e.str,
            c: e.str,
          }),
        ),
      },
      (params) =>
        e.for(e.array_unpack(params.profiles), (profile) =>
          e.insert(e.Profile, profile),
        ),
    );

    await query.run(client, {
      profiles: [{ a: "a", b: "b", c: "c" }],
    });
  });

  test("type union links", async () => {
    const query = e.insert(e.Z, {
      xy: e.insert(e.Y, {
        c: true,
      }),
    });

    await query.run(client);
  });

  test("insert many-to-one and select one", async () => {
    const edgeql = e
      .params(
        {
          name: e.str,
          nemeses: e.array(e.tuple({ name: e.str })),
        },
        (params) => {
          const hero = e.insert(e.Hero, {
            name: params.name,
          });
          const villains = e.for(e.array_unpack(params.nemeses), (nemesis) => {
            return e.insert(e.Villain, {
              name: nemesis.name,
              nemesis: hero,
            });
          });

          return e.with([villains], e.select(hero));
        },
      )
      .toEdgeQL();

    // Also test including `hero` in the `with` refs
    assert.equal(
      edgeql,
      e
        .params(
          {
            name: e.str,
            nemeses: e.array(e.tuple({ name: e.str })),
          },
          (params) => {
            const hero = e.insert(e.Hero, {
              name: params.name,
            });
            const villains = e.for(
              e.array_unpack(params.nemeses),
              (nemesis) => {
                return e.insert(e.Villain, {
                  name: nemesis.name,
                  nemesis: hero,
                });
              },
            );

            return e.with([hero, villains], e.select(hero));
          },
        )
        .toEdgeQL(),
    );
    assert.equal(
      edgeql,
      e
        .params(
          {
            name: e.str,
            nemeses: e.array(e.tuple({ name: e.str })),
          },
          (params) => {
            const hero = e.insert(e.Hero, {
              name: params.name,
            });
            const villains = e.for(
              e.array_unpack(params.nemeses),
              (nemesis) => {
                return e.insert(e.Villain, {
                  name: nemesis.name,
                  nemesis: hero,
                });
              },
            );

            return e.with([villains, hero], e.select(hero));
          },
        )
        .toEdgeQL(),
    );
  });
});
