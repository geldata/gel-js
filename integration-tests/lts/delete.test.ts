import assert from "node:assert/strict";
import type * as gel from "gel";

import e from "./dbschema/edgeql-js";
import { setupTests, teardownTests, tc, type TestData } from "./setupTeardown";

describe("delete", () => {
  let client: gel.Client;
  let data: TestData;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("basic delete", async () => {
    const insertBlackWidow = e.insert(e.Hero, {
      name: e.str("Black Widow"),
      secret_identity: e.str("Natasha Romanoff"),
    });

    const insertedResult = await insertBlackWidow.run(client);

    const deleteBlackWidow = e.delete(e.Hero, (hero) => ({
      filter_single: e.op(hero.name, "=", "Black Widow"),
    }));
    const deletedResult = await deleteBlackWidow.run(client);

    assert.ok(deletedResult);
    assert.deepEqual(deletedResult.id, insertedResult.id);

    const deleteWrappingSelect = e.delete(
      e.select(e.Hero, (hero) => ({
        name: true,
        filter_single: e.op(hero.name, "=", "Black Widow"),
      })),
    );
    const wrappingDeleteResult = await deleteWrappingSelect.run(client);

    tc.assert<tc.IsExact<typeof wrappingDeleteResult, { id: string } | null>>(
      true,
    );
    assert.equal(wrappingDeleteResult, null);

    const deleteAll = e.delete(e.Hero);
    tc.assert<
      tc.IsExact<(typeof deleteAll)["__cardinality__"], gel.$.Cardinality.Many>
    >(true);
  });

  test("delete with filter_single", async () => {
    await e
      .delete(e.Movie, () => ({
        filter_single: { id: "00000000-0000-0000-0000-000000000000" },
      }))
      .run(client);
  });

  test("delete with in operator", async () => {
    const query = e.params(
      {
        titles: e.array(e.str),
      },
      ({ titles }) =>
        e.delete(e.Movie, (movie) => ({
          filter: e.op(movie.title, "in", e.array_unpack(titles)),
        })),
    );

    const deletedResult = await query.run(client, {
      titles: [data.the_avengers.title, data.civil_war.title],
    });
    assert.deepEqual(
      deletedResult,
      [{ id: data.the_avengers.id }, { id: data.civil_war.id }],
      "deletes the correct movies",
    );
  });
});
