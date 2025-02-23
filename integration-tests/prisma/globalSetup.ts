import createClient from "edgedb";

export default async () => {
  const client = createClient();

  process.env._JEST_EDGEDB_VERSION = await client.queryRequiredSingleJSON(
    `select sys::get_version()`,
  );
};
