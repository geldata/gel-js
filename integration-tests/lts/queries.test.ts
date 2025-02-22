import assert from "node:assert/strict";
import type * as gel from "gel";
import * as tc from "conditional-type-checks";

import {
  exclusive,
  type ExclusiveArgs,
  type ExclusiveReturns,
  getMoviesStarring,
  type GetMoviesStarringArgs,
  type GetMoviesStarringReturns,
  deepArrayInput,
  type DeepArrayInputArgs,
  freeShape,
} from "./dbschema/queries";
import { type TestData, setupTests, teardownTests } from "./setupTeardown";

describe("queries", () => {
  let client: gel.Client;
  let data: TestData;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client, data } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("basic select", async () => {
    const result = await getMoviesStarring(client, {
      name: "Iron Man",
      years: [2012, 2016] as const, // readonly arrays accepted
    });

    type result = typeof result;
    tc.assert<
      tc.IsExact<
        result,
        {
          id: string;
          title: string;
          release_year: number;
          characters: {
            name: string;
            height: string | null;
            "@character_name": string | null;
          }[];
          tuple: [number, string, bigint[]];
          version: {
            major: number;
            minor: number;
            stage: "dev" | "rc" | "beta" | "alpha" | "final";
            stage_no: number;
            local: string[];
          };
          range: gel.Range<number>;
          local_date: gel.LocalDate;
        }[]
      >
    >(true);

    assert.equal(result.length, 2);

    tc.assert<
      tc.IsExact<
        GetMoviesStarringArgs,
        {
          name?: string | null;
          years: readonly number[];
        }
      >
    >(true);

    tc.assert<tc.IsExact<GetMoviesStarringReturns, result>>(true);
  });

  test("deep array input", async () => {
    const result = await deepArrayInput(client, {
      deep: [
        ["name", "Stark"],
        ["color", "red"],
      ] as const,
    });

    type result = typeof result;
    tc.assert<tc.IsExact<result, [string, string][]>>(true);

    tc.assert<
      tc.IsExact<
        DeepArrayInputArgs,
        {
          deep: readonly (readonly [string, string])[];
        }
      >
    >(true);
  });

  test("select filtered on exclusive property", async () => {
    const result = await exclusive(client, {
      id: data.cap.id,
    });

    tc.assert<tc.IsExact<ExclusiveReturns, typeof result>>(true);

    tc.assert<
      tc.IsExact<
        ExclusiveArgs,
        {
          id: string;
        }
      >
    >(true);

    assert.ok(result);
    assert.equal(result.id, data.cap.id);

    const missing = await exclusive(client, {
      id: "00000000-0000-0000-0000-000000000000",
    });

    assert.equal(missing, null);
  });

  test("free shape", async () => {
    const result = await freeShape(client, { data: "123" });

    assert.ok(result);
    assert.deepEqual(result, {
      name: "arg",
      points: 1234n,
      data: "123",
      arg: ["asdf"],
      enums: ["Horror", "Action"],
      regexp: "find me",
    });
  });
});
