import assert from "node:assert/strict";
import { type Client } from "gel";
import e from "./db/schema/edgeql-js";
import { setupTests, teardownTests } from "./setupTeardown";

describe("legacy database version smoke tests", () => {
  let client: Client;

  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("basic smoke test flow", async () => {
    await e
      .insert(e.User, {
        name: String(Math.random()),
        friends: e.select(
          e.detached(
            e.insert(e.User, {
              name: String(Math.random()),
            }),
          ),
        ),
      })
      .run(client);

    assert.equal(
      (
        await e
          .select(e.User, () => ({
            id: true,
          }))
          .run(client)
      ).length,
      2,
    );
  });
});
