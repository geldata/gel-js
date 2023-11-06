const fs = require("node:fs/promises");
const { createClient } = require("edgedb");

const client = createClient("_localdev");

(async function () {
  const OAuthProviders = await client.query(`
  with providers := (
    select schema::ObjectType
    filter .bases.name = 'ext::auth::OAuthProviderConfig'
  )
  select (
    select providers.properties filter .name = 'name'
  ).default`);

  await fs.writeFile(
    "./src/consts.ts",
    `// AUTOGENERATED - Run \`yarn gen-consts\` to re-generate.

export const builtinOAuthProviderNames = [
${OAuthProviders.sort()
  .map((provider) => `  ${provider.replace(/^'|'$/g, '"')},`)
  .join("\n")}
] as const;
export type BuiltinOAuthProviderNames =
  (typeof builtinOAuthProviderNames)[number];

export const builtinLocalProviderNames = [
  "builtin::local_emailpassword",
] as const;
export type BuiltinLocalProviderNames =
  (typeof builtinLocalProviderNames)[number];
`
  );

  console.log('Generated into "src/consts.ts"');
})();
