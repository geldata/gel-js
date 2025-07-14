import * as process from "node:process";
import {
  connectToServer,
  generateStatusFileName,
  getServerCommand,
  getWSLPath,
  startServer,
  ConnectConfig,
} from "@repo/test-utils";

export default async () => {
  console.log("\nStarting Gel test cluster...");

  const statusFile = generateStatusFileName("node");
  console.log("Node status file:", statusFile);

  const { args, availableFeatures } = getServerCommand(getWSLPath(statusFile));
  console.time("server");
  console.time("server-start");
  const { proc, config } = await startServer(args, statusFile);
  console.timeEnd("server-start");

  console.time("server-connect");
  const { client, version } = await connectToServer(config);
  console.timeEnd("server-connect");

  const jestConfig: ConnectConfig = {
    ...config,
    user: version.major >= 6 ? "admin" : "edgedb",
  };

  // @ts-ignore
  global.gelProc = proc;

  process.env._JEST_GEL_CONNECT_CONFIG = JSON.stringify(jestConfig);
  process.env._JEST_GEL_AVAILABLE_FEATURES = JSON.stringify(availableFeatures);

  // @ts-ignore
  global.gelConn = client;
  process.env._JEST_GEL_VERSION = JSON.stringify(version);

  console.time("server-extension-list");
  const availableExtensions = (
    await client.query<{
      name: string;
      version: { major: number; minor: number };
    }>(`select sys::ExtensionPackage {name, version}`)
  ).map(({ name, version }) => [name, version]);
  process.env._JEST_GEL_AVAILABLE_EXTENSIONS =
    JSON.stringify(availableExtensions);
  console.timeEnd("server-extension-list");

  console.timeEnd("server");
  console.log(`Gel test cluster is up [port: ${jestConfig.port}]...`);
};
