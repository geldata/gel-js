import * as tc from "conditional-type-checks";
import { type Client, createClient } from "gel";

export { tc };

type depromisify<T> = T extends Promise<infer U> ? U : T;
export type TestData = depromisify<ReturnType<typeof setupTests>>["data"];

export async function setupTests() {
  const client = createClient();

  await client.query(`
    insert User {
      movies := {
        (insert Movie { title := "Inception", year := 2010, plot := "Inception plot" })
      },
      shows := {
        (insert Show { title := "Friends", year := 1994, seasons := 10 })
      },
      documentaries:= {
        (insert Documentary { title := "Free Solo", plot := "Free Solo plot" })
      }
    }`);

  return {
    data: null,
    client,
  };
}

async function cleanupData(client: Client) {
  await client.execute(`
    delete CryptoTest;
    delete User;
    delete Post;
    delete WithMultiRange;
    delete Movie;
    delete Show;
    delete Documentary;
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
