import type { Client, MultiRange } from "gel";
import e from "./dbschema/edgeql-js";
import { setupTests, tc, teardownTests } from "./setupTeardown";

import type { WithMultiRange } from "./dbschema/interfaces";

interface BaseObject {
  id: string;
}
interface test_WithMultiRange extends BaseObject {
  ranges: MultiRange<number>;
}

describe("multirange", () => {
  let client: Client;
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  }, 10_000);

  test("check generated interfaces", () => {
    tc.assert<tc.IsExact<WithMultiRange, test_WithMultiRange>>(true);
  });

  test("inferred return type + literal encoding", async () => {
    const query = e.select(e.WithMultiRange, () => ({
      ranges: true,
    }));

    const result = await query.run(client);

    tc.assert<
      tc.IsExact<
        typeof result,
        {
          ranges: MultiRange<number>;
        }[]
      >
    >(true);
  });
});
