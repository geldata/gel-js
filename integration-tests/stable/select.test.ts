import type * as gel from "gel";
import assert from "node:assert/strict";

import e, { type $infer } from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc } from "./setupTeardown";

let client: gel.Client;

describe("select", () => {
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  }, 10_000);

  test("union of polymorphic types in computed schema field", () => {
    const WatchingList = e.shape(e.User.watching_list, () => ({
      year: true,
      title: true,
      ...e.is(e.Movie, {
        plot: true,
      }),
      ...e.is(e.Show, {
        seasons: true,
      }),
    }));

    const q = e.select(e.User, () => ({
      watching_list: WatchingList,
    }));

    type qT = $infer<typeof q>;

    tc.assert<
      tc.IsExact<
        qT,
        {
          watching_list: (
            | {
                year: number;
                title: string;
                plot: string;
                __typename: "default::Movie";
              }
            | {
                year: number;
                title: string;
                seasons: number;
                __typename: "default::Show";
              }
          )[];
        }[]
      >
    >(true);
  });

  test("union of 3 types in computed schema field - two types extend, one doesn't, query the common field only", async () => {
    const q = e.select(e.User, () => ({
      all_media: {
        title: true,
      },
    }));

    type qT = $infer<typeof q>;

    tc.assert<
      tc.IsExact<
        qT,
        {
          all_media: {
            title: string;
          }[];
        }[]
      >
    >(true);

    const result = await q.run(client);
    const expected = [
      {
        all_media: [
          {
            title: "Inception",
          },
          {
            title: "Friends",
          },
          {
            title: "Free Solo",
          },
        ],
      },
    ];
    assert.deepEqual(result, expected);
  });

  test("union of 3 types in computed schema field - two types extend, one doesn't", async () => {
    const q = e.select(e.User, () => ({
      all_media: (all_media) => ({
        title: true,
        ...e.is(e.Content, { year: true }),
        ...e.is(e.Show, {
          seasons: true,
        }),
        plot: e.op(
          all_media.is(e.Movie).plot,
          "??",
          all_media.is(e.Documentary).plot,
        ),
      }),
    }));

    type qT = $infer<typeof q>;

    tc.assert<
      tc.IsExact<
        qT,
        {
          all_media: (
            | {
                title: string;
                plot: string | null;
                __typename: "default::Documentary";
              }
            | {
                title: string;
                plot: string | null;
                year: number;
                __typename: "default::Movie";
              }
            | {
                title: string;
                plot: string | null;
                year: number;
                seasons: number;
                __typename: "default::Show";
              }
          )[];
        }[]
      >
    >(true);

    const result = await q.run(client);
    const expected = [
      {
        all_media: [
          {
            __typename: "default::Movie",
            plot: "Inception plot",
            seasons: null,
            title: "Inception",
            year: 2010,
          },
          {
            __typename: "default::Show",
            plot: null,
            seasons: 10,
            title: "Friends",
            year: 1994,
          },
          {
            __typename: "default::Documentary",
            plot: "Free Solo plot",
            seasons: null,
            title: "Free Solo",
            year: null,
          },
        ],
      },
    ];
    assert.deepEqual(result, expected);
  });

  test("a field cannot be selected as common if it exists in only one of the union types", async () => {
    const q = e.select(e.User, () => ({
      watching_list: {
        year: true,
        title: true,
        plot: true,
      },
    }));

    type qT = $infer<typeof q>;

    tc.assert<
      tc.IsExact<
        qT,
        {
          watching_list: {
            year: number;
            title: string;
          }[];
        }[]
      >
    >(true);

    return assert.rejects(async () => await q.run(client), {
      message: `Field "plot" does not exist in default::Movie | default::Show`,
    });
  });
});
