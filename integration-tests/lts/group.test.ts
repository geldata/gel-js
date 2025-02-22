import assert from "node:assert/strict";
import type * as gel from "gel";
import * as tc from "conditional-type-checks";

import e, { type $infer } from "./dbschema/edgeql-js";
import { setupTests, teardownTests, type TestData } from "./setupTeardown";

describe("group", () => {
  let client: gel.Client;
  let data: TestData;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("basic group", async () => {
    const query = e.group(e.Movie, (movie) => {
      const release_year = movie.release_year;
      return {
        release_year: true,
        title: true,
        characters: { name: true },
        by: {
          release_year,
        },
      };
    });

    type query = $infer<typeof query>;
    const result = await query.run(client);
    tc.assert<
      tc.IsExact<
        query,
        {
          grouping: string[];
          key: {
            release_year: number | null;
          };
          elements: {
            release_year: number;
            title: string;
            characters: {
              name: string;
            }[];
          }[];
        }[]
      >
    >(true);

    assert.equal(result.length, 2);
    assert.equal(result[0].grouping[0], "release_year");
    assert.equal(result[1].grouping[0], "release_year");
    assert.equal(result[0].elements.length, 1);
    assert.ok(result[0].elements[0].title);
    assert.ok(result[1].elements[0].release_year);
    assert.ok(result[1].elements[0].characters[0].name);
  });

  test("group nested select", async () => {
    const query = e.group(
      e.select(e.Movie, (m) => ({
        filter: e.op(m.release_year, ">", 2015),
      })),
      (movie) => {
        const release_year = movie.release_year;
        return {
          release_year: true,
          title: true,
          characters: { name: true },
          by: {
            release_year,
          },
        };
      },
    );

    type query = $infer<typeof query>;
    const result = await query.run(client);
    tc.assert<
      tc.IsExact<
        query,
        {
          grouping: string[];
          key: {
            release_year: number | null;
          };
          elements: {
            release_year: number;
            title: string;
            characters: {
              name: string;
            }[];
          }[];
        }[]
      >
    >(true);

    assert.equal(result.length, 1);
    assert.equal(result[0].grouping[0], "release_year");
    assert.equal(result[0].elements.length, 1);
    assert.ok(result[0].elements[0].title);
    assert.ok(result[0].elements[0].release_year);
    assert.ok(result[0].elements[0].characters[0].name);
  });

  test("multiple keys", async () => {
    const query = e.group(e.Movie, (movie) => {
      const title = movie.title;
      const ry = movie.release_year;
      return {
        by: {
          title,
          ry,
        },
      };
    });

    type query = $infer<typeof query>;
    const result = await query.run(client);
    tc.assert<
      tc.IsExact<
        query,
        {
          grouping: string[];
          key: {
            title: string | null;
            ry: number | null;
          };
          elements: {
            id: string;
          }[];
        }[]
      >
    >(true);

    assert.equal(result.length, 2);
    assert.equal(result[0].elements.length, 1);
    const civilWar = result.find(
      (val) => val.key.title === data.civil_war.title,
    );
    assert.deepEqual(civilWar, {
      ...civilWar,
      key: { title: data.civil_war.title, ry: data.civil_war.release_year },
      grouping: ["title", "ry"],
    });
    const theAvengers = result.find(
      (val) => val.key.title === data.the_avengers.title,
    );
    assert.deepEqual(theAvengers, {
      ...theAvengers,
      key: {
        title: data.the_avengers.title,
        ry: data.the_avengers.release_year,
      },
      grouping: ["title", "ry"],
    });
  });

  test("extracted key with shape", async () => {
    const query = e.group(e.Movie, (movie) => {
      const titleLen = e.len(movie.title);

      return {
        title: true,
        release_year: true,
        len: titleLen,
        by: {
          title1: titleLen,
          title2: titleLen,
          title3: titleLen,
        },
      };
    });

    assert.equal(
      query.toEdgeQL(),
      `\
WITH
  __scope_0_defaultMovie_expr := DETACHED default::Movie,
  __scope_0_defaultMovie := (FOR __scope_0_defaultMovie_inner IN {__scope_0_defaultMovie_expr} UNION (
    WITH
      __withVar_1 := std::len(__scope_0_defaultMovie_inner.title)
    SELECT __scope_0_defaultMovie_inner {
      __withVar_1 := __withVar_1
    }
  )),
  __scope_0_defaultMovie_groups := (
    GROUP __scope_0_defaultMovie
    USING
      title1 := __scope_0_defaultMovie.__withVar_1,
      title2 := __scope_0_defaultMovie.__withVar_1,
      title3 := __scope_0_defaultMovie.__withVar_1
    BY title1, title2, title3
)
SELECT __scope_0_defaultMovie_groups {
  key: {title1, title2, title3},
  grouping,
  elements: {
    title,
    release_year,
    single len := __scope_0_defaultMovie_groups.elements.__withVar_1
  }
}`,
    );

    const result = await query.run(client);
    type result = typeof result;
    tc.assert<
      tc.IsExact<
        result,
        {
          grouping: string[];
          key: {
            title1: number | null;
            title2: number | null;
            title3: number | null;
          };
          elements: {
            release_year: number;
            title: string;
            len: number;
          }[];
        }[]
      >
    >(true);
    assert.equal(result.length, 2);
    assert.ok(result[0].elements[0].title);
    assert.ok(result[1].elements[0].release_year);
    assert.ok(result[1].elements[0].len);
    assert.deepEqual(result[0].grouping, ["title1", "title2", "title3"]);
  });

  test("grouping set", async () => {
    const query = e.group(e.Movie, (movie) => {
      const title = movie.title;

      return {
        by: {
          title,
          ...e.group.set({
            year: movie.release_year,
            rating: movie.rating,
          }),
        },
      };
    });

    const result = await query.run(client);
    assert.equal(result.length, 4);
    assert.deepEqual(result[0].grouping, ["title", "year"]);
    assert.deepEqual(result[1].grouping, ["title", "year"]);
    assert.deepEqual(result[2].grouping, ["title", "rating"]);
    assert.deepEqual(result[3].grouping, ["title", "rating"]);
    assert.equal(result[0].elements.length, 1);
  });

  test("grouping tuples", async () => {
    const query = e.group(e.Movie, (movie) => {
      return {
        by: {
          ...e.group.tuple({
            title: movie.title,
            len: e.len(movie.title),
          }),
          ...e.group.tuple({
            year: movie.release_year,
            rating: movie.rating,
          }),
        },
      };
    });

    const result = await query.run(client);
    assert.equal(
      query.toEdgeQL().includes(`BY (title, len), (year, rating)`),
      true,
    );
    assert.deepEqual(result[0].grouping, ["title", "len", "year", "rating"]);
    assert.equal(result.length, 2);
  });

  test("cube", async () => {
    const query = e.group(e.Movie, (movie) => {
      return {
        by: {
          ...e.group.cube({
            title: movie.title,
            len: e.len(movie.title),
            year: movie.release_year,
          }),
        },
      };
    });

    const result = await query.run(client);
    assert.equal(query.toEdgeQL().includes(`BY cube(title, len, year)`), true);
    assert.equal(result.length, 15);
  });

  test("rollup", async () => {
    const query = e.group(e.Movie, (movie) => {
      return {
        by: {
          ...e.group.rollup({
            title: movie.title,
            len: e.len(movie.title),
            year: movie.release_year,
          }),
        },
      };
    });

    const result = await query.run(client);
    assert.equal(
      query.toEdgeQL().includes(`BY rollup(title, len, year)`),
      true,
    );
    assert.equal(
      result
        .map((r) => r.grouping)
        .every((g) => {
          return (
            (!g[0] || g[0] === "title") &&
            (!g[1] || g[1] === "len") &&
            (!g[2] || g[2] === "year")
          );
        }),
      true,
    );
    assert.equal(result.length, 7);
  });

  test("key override error", async () => {
    assert.throws(() =>
      e.group(e.Movie, (movie) => {
        return {
          by: {
            ...e.group.tuple({
              title: movie.title,
            }),
            ...e.group.tuple({
              title: e.len(movie.title),
            }),
          },
        };
      }),
    );
  });

  // clause ordering in `using`
  test("key override error", async () => {
    // reused elements should get pulled out into with
    // and ordered topologically
    const query = e.group(e.Movie, (movie) => {
      const len = e.len(movie.title);
      const ccc = e.op(len, "+", 4);

      return {
        by: {
          ccc,
          ccc2: ccc,
          len,
          len2: len,
        },
      };
    });
    const result = await query.run(client);
    assert.deepEqual(result[0].grouping, ["ccc", "ccc2", "len", "len2"]);
  });
});
