import createClient from "gel";

export default async () => {
  const client = createClient();

  process.env._JEST_GEL_VERSION = await client.queryRequiredSingleJSON(
    `select sys::get_version()`,
  );
};
