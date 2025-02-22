import type { Client } from "gel";
import e, { type $infer } from "./dbschema/edgeql-js";
import { setupTests, tc, teardownTests } from "./setupTeardown";

describe("auth", () => {
  let client: Client;
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  }, 10_000);

  test("check generated globals", () => {
    const clientTokenIdentity = e.select(
      e.assert_single(e.ext.auth.global.ClientTokenIdentity),
      (i) => ({
        ...i["*"],
      }),
    );

    tc.assert<
      tc.IsExact<
        $infer<typeof clientTokenIdentity>,
        {
          id: string;
          created_at: Date;
          modified_at: Date;
          issuer: string;
          subject: string;
        } | null
      >
    >(true);
  });

  const clientToken = e.select(e.ext.auth.global.client_token);
  tc.assert<tc.IsExact<$infer<typeof clientToken>, string | null>>(true);
});
