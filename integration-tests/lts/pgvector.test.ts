import assert from "node:assert/strict";
import { type Client } from "gel";
import e from "./dbschema/edgeql-js";
import { setupTests, tc, teardownTests } from "./setupTeardown";

import type { PgVectorTest } from "./dbschema/interfaces";

interface BaseObject {
  id: string;
}
interface test_PgVectorTest extends BaseObject {
  test_embedding?: Float32Array | null;
}

describe("pgvector", () => {
  let client: Client;
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  }, 10_000);

  test("check generated interfaces", () => {
    tc.assert<tc.IsExact<PgVectorTest, test_PgVectorTest>>(true);
  });

  test("inferred return type + literal encoding", async () => {
    const query = e.select(e.PgVectorTest, ($) => {
      const dist = e.ext.pgvector.cosine_distance(
        $.test_embedding,
        e.ext.pgvector.vector(Float32Array.from([1, 2, 3])),
      );
      return {
        test_embedding: true,
        vector_literal: e.ext.pgvector.vector(Float32Array.from([1, 2, 3])),
        dist,
        order_by: dist,
      };
    });

    const result = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          test_embedding: Float32Array | null;
          vector_literal: Float32Array;
          dist: number | null;
        }[]
      >
    >(true);
  });

  test("params", async () => {
    const query = e.params(
      { vec: e.ext.pgvector.vector, arrayVec: e.ext.pgvector.vector },
      ($) => e.select($),
    );

    const arrayVec = Array(10)
      .fill(0)
      .map(() => Math.random());
    const args = {
      vec: Float32Array.from(arrayVec),
      arrayVec,
    };

    const result = await query.run(client, args);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          vec: Float32Array;
          arrayVec: Float32Array;
        }
      >
    >(true);

    assert.deepEqual(result, {
      ...args,
      arrayVec: Float32Array.from(args.arrayVec),
    });
  });
});
