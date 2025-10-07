import assert from "node:assert/strict";
import type * as gel from "gel";

import e from "./dbschema/edgeql-js";
import type { UpdateShape } from "./dbschema/edgeql-js/syntax";
import { setupTests, tc, teardownTests, type TestData } from "./setupTeardown";

describe("update", () => {
  let client: gel.Client;
  let data: TestData;

  const $Hero = e.Hero.__element__;
  const $Villain = e.Villain.__element__;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("update", async () => {
    e.update(e.Hero, () => ({
      set: {
        name: "asdf",
      },
    })).toEdgeQL();

    e.update(e.Villain, () => ({
      set: {
        name: e.str("asdf"),
        nemesis: e.cast($Hero, e.set()),
      },
    })).toEdgeQL();

    e.update(e.Bag, () => ({
      set: {
        stringsMulti: {
          "+=": ["new string"],
        },
      },
    })).toEdgeQL();

    e.update(e.Bag, () => ({
      set: {
        stringsMulti: {
          "+=": "new string",
        },
      },
    })).toEdgeQL();
  });

  test("update assignable", () => {
    e.update(e.Bag, () => ({
      set: {
        int32Field: e.float32(23),
        int64Field: e.float64(12),
        // @ts-expect-error
        bigintField: e.float32(324),
        // @ts-expect-error
        float32Field: e.bigint(BigInt(1234)),
      },
    })).toEdgeQL();

    e.update(e.Bag, () => ({
      set: {
        int32Field: 23,
        bigintField: BigInt(324),
        // @ts-expect-error
        float32Field: BigInt(1234),
      },
    })).toEdgeQL();

    e.update(e.Movie, () => ({
      set: {
        rating: null,
        profile: null,
        // @ts-expect-error release_year is required prop
        release_year: null,
      },
    })).toEdgeQL();
  });

  test("nested update and explicit with", async () => {
    e.params({ movieId: e.uuid }, (params) => {
      const movie = e.select(e.Movie, (m) => ({
        filter: e.op(m.id, "=", params.movieId),
      }));

      const updateChar = e.update(movie.characters, (c) => ({
        set: {
          name: e.str_lower(c.name),
        },
      }));

      const updateProfile = e.update(movie.profile, (p) => ({
        set: {
          a: e.str_upper(p.a),
        },
      }));

      return e.with([updateChar, updateProfile], e.select(movie));
    }).toEdgeQL();
  });

  test("nested update and explicit with, unwrapped select should fail", async () => {
    assert.throws(
      () =>
        e
          .params({ movieId: e.uuid }, (params) => {
            const movie = e.select(e.Movie, (m) => ({
              filter: e.op(m.id, "=", params.movieId),
            }));

            const updateChar = e.update(movie.characters, (c) => ({
              set: {
                name: e.str_lower(c.name),
              },
            }));

            const updateProfile = e.update(movie.profile, (p) => ({
              set: {
                a: e.str_upper(p.a),
              },
            }));

            return e.with([updateChar, updateProfile], movie);
          })
          .toEdgeQL(),
      {
        message:
          `Ref expressions in with() cannot reference the expression to which the ` +
          `'WITH' block is being attached. Consider wrapping the expression in a select.`,
      },
    );
  });

  test("scoped update", async () => {
    const query = e.update(e.Hero, (hero) => ({
      filter_single: e.op(hero.name, "=", data.spidey.name),
      set: {
        name: e.op("The Amazing ", "++", hero.name),
      },
    }));

    const result = await query.run(client);
    tc.assert<tc.IsExact<typeof result, { id: string } | null>>(true);

    assert.deepEqual(result, { id: data.spidey.id });

    assert.deepEqual(
      await e
        .select(e.Hero, (hero) => ({
          name: true,
          filter_single: e.op(hero.id, "=", e.uuid(result!.id)),
        }))
        .run(client),
      { name: `The Amazing ${data.spidey.name}` },
    );
  });

  test("update link property", async () => {
    const theAvengers = e
      .select(e.Movie, (movie) => ({
        filter: e.op(movie.title, "=", "The Avengers"),
        limit: 1,
      }))
      .assert_single();

    const qq1 = await e
      .select(theAvengers, () => ({ id: true, characters: true }))
      .run(client);

    assert.equal(qq1?.characters.length, 2);

    const q2 = e.update(theAvengers, () => ({
      set: {
        characters: {
          "+=": e.select(e.Villain, (villain) => ({
            filter: e.op(villain.name, "=", data.thanos.name),
          })),
        },
      },
    }));
    await q2.run(client);

    const theAvengersCast: { name: string; character_name: string }[] = [
      { name: data.iron_man.name, character_name: "Tony Stark!" },
      { name: data.cap.name, character_name: "Steve Rogers!" },
      { name: data.thanos.name, character_name: "Thanos!" },
    ];

    const q2CharName = e.params(
      { cast: e.array(e.tuple({ name: e.str, character_name: e.str })) },
      (params) =>
        e.update(theAvengers, (m) => ({
          set: {
            characters: {
              "+=": e.for(e.array_unpack(params.cast), (cast) =>
                e.select(m.characters, (c) => ({
                  "@character_name": cast.character_name,
                  filter: e.op(c.name, "=", cast.name),
                })),
              ),
            },
          },
        })),
    );
    await q2CharName.run(client, { cast: theAvengersCast });

    const t2 = await e
      .select(theAvengers, () => ({
        id: true,
        characters: () => ({ "@character_name": true, name: true }),
      }))
      .run(client);
    assert.equal(t2?.characters.length, 3);
    const charSet = new Set(t2.characters.map((c) => c["@character_name"]));
    assert.ok(charSet.has("Thanos!"));
    assert.ok(charSet.has("Tony Stark!"));
    assert.ok(charSet.has("Steve Rogers!"));

    await e
      .update(theAvengers, () => ({
        set: {
          characters: {
            "-=": e.select(e.Villain, (villain) => ({
              filter: e.op(villain.name, "=", data.thanos.name),
            })),
          },
        },
      }))
      .run(client);

    const t3 = await e
      .select(theAvengers, () => ({ id: true, characters: true }))
      .run(client);
    assert.equal(t3?.characters.length, 2);

    await e
      .update(theAvengers, () => ({
        set: {
          characters: e.cast($Villain, e.set()),
        },
      }))
      .run(client);

    const t4 = await e
      .select(theAvengers, () => ({ id: true, characters: true }))
      .run(client);
    assert.equal(t4?.characters.length, 0);

    await e
      .update(theAvengers, () => ({
        set: {
          characters: e.select(e.Hero, (hero) => ({
            filter: e.op(
              hero.id,
              "in",
              e.set(e.uuid(data.cap.id), e.uuid(data.iron_man.id)),
            ),
          })),
        },
      }))
      .run(client);

    const t5 = await e
      .select(theAvengers, () => ({ id: true, characters: true }))
      .run(client);
    assert.equal(t5?.characters.length, 2);
  });

  test("optional prop update", async () => {
    const theAvengers = await e
      .select(e.Movie, () => ({ filter_single: { title: "The Avengers" } }))
      .run(client);
    assert.ok(theAvengers);

    const query = e.params({ title: e.optional(e.str) }, (params) => {
      return e.update(e.Movie, (m) => ({
        filter_single: { id: theAvengers.id },
        set: {
          title: e.op(params.title, "??", m.title),
        },
      }));
    });
    await query.run(client, { title: "The Avengers!" });
    await query.run(client, {});

    const selected = await e
      .select(e.Movie, () => ({
        id: true,
        title: true,
        filter_single: { id: theAvengers.id },
      }))
      .run(client);
    assert.ok(selected);
    assert.equal(selected.title, "The Avengers!");
  });

  test("exclude readonly props", () => {
    type updateProfileShape = UpdateShape<(typeof e)["Profile"]>;
    tc.assert<
      tc.IsExact<
        keyof updateProfileShape,
        "plot_summary" | "a" | "b" | "c" | "d"
      >
    >(true);
  });

  test("empty update", async () => {
    const result = await e.update(e.Movie, () => ({ set: {} })).run(client);
    assert.ok(result);
  });

  test("update with filter_single", async () => {
    await e
      .update(e.Movie, () => ({
        filter_single: { id: data.the_avengers.id },
        set: {},
      }))
      .run(client);
  });

  test("update with filter_single + op", async () => {
    await e
      .update(e.Profile, (profile) => ({
        filter_single: e.op(
          profile["<profile[is Movie]"].title,
          "=",
          "The Avengers",
        ),
        set: { a: "test" },
      }))
      .run(client);
  });
});
