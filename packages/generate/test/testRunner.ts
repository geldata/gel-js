import createClient from "../../gel/src/index.node";

import {
  shutdown,
  applyMigrations,
  generateStatusFileName,
  getServerCommand,
  getWSLPath,
  startServer,
  runCommand,
  configToEnv,
} from "../../gel/test/testUtil";

(async function main() {
  console.log("\nStarting Gel test cluster...");

  const statusFile = generateStatusFileName("node");
  console.log("Node status file:", statusFile);

  const { args } = getServerCommand(getWSLPath(statusFile));

  const { proc, config } = await startServer(args, statusFile);

  console.log(`Gel test cluster is up [port: ${config.port}]...`);

  const managementConn = await createClient(config).ensureConnected();

  try {
    await applyMigrations(config);
    console.log(`\nRunning tests...`);
    await runCommand("yarn", ["test"], configToEnv(config));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    console.log("Shutting down Gel test cluster...");
    await shutdown(proc, managementConn);
    console.log("Gel test cluster is down...");
  }
})();
