import * as tc from "conditional-type-checks";
import { type Client, createClient } from "edgedb";

export { tc };

type depromisify<T> = T extends Promise<infer U> ? U : T;
export type TestData = depromisify<ReturnType<typeof setupTests>>["data"];

export async function setupTests() {
  const client = createClient();
  await cleanupData(client);

  await client.execute(`
    insert User {name := 'Alice'};
    insert User {name := 'Billie'};
    insert User {name := 'Cameron'};
    insert User {name := 'Dana'};
    insert User {name := 'Elsa'};
    insert User {name := 'Zoe'};

    insert UserGroup {
        name := 'red',
        users := (select User filter .name not in {'Elsa', 'Zoe'}),
    };
    insert UserGroup {
        name := 'green',
        users := (select User filter .name in {'Alice', 'Billie'}),
    };
    insert UserGroup {
        name := 'blue',
    };

    insert GameSession {
        num := 123,
        players := (select User filter .name in {'Alice', 'Billie'}),
    };
    insert GameSession {
        num := 456,
        players := (select User filter .name in {'Dana'}),
    };

    insert Post {
        author := assert_single((select User filter .name = 'Alice')),
        body := 'Hello',
    };
    insert Post {
        author := assert_single((select User filter .name = 'Alice')),
        body := "I'm Alice",
    };
    insert Post {
        author := assert_single((select User filter .name = 'Cameron')),
        body := "I'm Cameron",
    };
    insert Post {
        author := assert_single((select User filter .name = 'Elsa')),
        body := '*magic stuff*',
    };
    insert AssortedScalars {
        name:= 'hello world',
        vals := ['brown', 'fox'],
        bstr := b'word\x00\x0b',
        ts:=<datetime>'2025-01-26T20:13:45+00:00',
    };
  `);

  return {
    // no data is needed
    data: {},
    client,
  };
}

async function cleanupData(client: Client) {
  await client.execute("delete Object");
}

export async function teardownTests(client: Client) {
  await cleanupData(client);

  await client.close();
}

export const versionGTE = (majorVer: number) => {
  const version = JSON.parse(process.env._JEST_EDGEDB_VERSION!);
  return version.major >= majorVer;
};

export const testIfVersionGTE = (majorVer: number) =>
  versionGTE(majorVer) ? test : test.skip;
