import * as tc from "conditional-type-checks";
import { type Client, createClient } from "gel";

export { tc };

// insert tony
// insert cap
// insert spidey
// insert thanos
// insert doc ock
// insert "The Avengers"

type depromisify<T> = T extends Promise<infer U> ? U : T;
export type TestData = depromisify<ReturnType<typeof setupTests>>["data"];

interface Hero {
  id: string;
  name: string;
  secret_identity: string;
}
interface Villain {
  id: string;
  name: string;
  nemesis: { id: string; name: string };
}
interface Movie {
  id: string;
  title: string;
  genre: string;
  rating: number | null;
  release_year: number;
  characters: { id: string }[];
}

export async function setupTests() {
  const client = createClient();
  await client.execute(`configure current database
  set allow_user_specified_id := true;`);
  await cleanupData(client);

  const iron_man: Hero = await client.queryRequiredSingle(`SELECT (INSERT Hero {
  name := "Iron Man",
  secret_identity := "Tony Stark"
}) {id, name, secret_identity}`);

  const cap: Hero = await client.queryRequiredSingle(`SELECT (INSERT Hero {
  name := "Captain America",
  secret_identity := "Steve Rogers"
}) { id, name, secret_identity }`);

  const spidey: Hero = await client.queryRequiredSingle(`SELECT (INSERT Hero {
  name := "Spider-Man",
  secret_identity := "Peter Parker"
}) { id, name, secret_identity }`);

  const thanos: Villain = await client.queryRequiredSingle(
    `SELECT (INSERT Villain {
  name := "Thanos",
  nemesis := (SELECT Hero FILTER .id = <uuid>$nemesis_id)
}) { id, name, nemesis: { id, name }}`,
    { nemesis_id: iron_man.id },
  );

  const docOck: Villain = await client.queryRequiredSingle(
    `SELECT (INSERT Villain {
  name := "Doc Ock",
  nemesis := (SELECT Hero FILTER .id = <uuid>$nemesis_id)
}) {id, name, nemesis: { id, name }}`,
    { nemesis_id: spidey.id },
  );

  const the_avengers: Movie = await client.queryRequiredSingle(
    `WITH
      ironman_id := <uuid>$ironman_id,
      cap_id := <uuid>$cap_id
SELECT (INSERT Movie {
  title := "The Avengers",
  rating := 10,
  genre := Genre.Action,
  release_year := 2012,
  characters := distinct (for char in {
    ('Tony Stark', ironman_id),
    ('Steve Rogers', cap_id)
  } union (
    SELECT Person { @character_name := char.0 } FILTER .id = char.1
  ))
}) {id, title, rating, genre, release_year, characters: {id}};`,
    { ironman_id: iron_man.id, cap_id: cap.id },
  );
  const civil_war: Movie = await client.queryRequiredSingle(
    `SELECT (INSERT Movie {
  title := "Captain America: Civil War",
  release_year := 2016,
  rating := 10,
  genre := Genre.Action,
  characters := (SELECT Hero)
}) {id, title, rating, genre, release_year, characters: {id}};`,
  );

  return {
    data: {
      iron_man,
      cap,
      spidey,
      thanos,
      docOck,
      the_avengers,
      civil_war,
    },
    client,
  };
}

async function cleanupData(client: Client) {
  await client.execute(`
    delete \`S p a M\`;
    delete A;
    delete Łukasz;
    delete Bag;
    delete Simple;
    delete User;
    delete Movie;
    delete Villain;
    delete Hero;
    delete Profile;
    delete PgVectorTest;
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
