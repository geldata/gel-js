import * as tc from "conditional-type-checks";
import { type Client, createClient } from "gel";

export { tc };

type depromisify<T> = T extends Promise<infer U> ? U : T;
export type TestData = depromisify<ReturnType<typeof setupTests>>["data"];

export async function setupTests() {
  const client = createClient();
  return {
    data: null,
    client,
  };
}

async function cleanupData(client: Client) {
  await client.execute(`
# Delete any user-defined objects here
select datetime_of_statement(); # noop-ish
`);
}

export async function teardownTests(client: Client) {
  await cleanupData(client);

  await client.close();
}

export const versionGTE = (majorVer: number) => {
  const version = JSON.parse(process.env._JEST_GEL_VERSION!);
  return version.major >= majorVer;
};

export const testIfVersionGTE = (majorVer: number) =>
  versionGTE(majorVer) ? test.skip : test;
