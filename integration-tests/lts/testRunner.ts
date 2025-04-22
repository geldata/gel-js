import createClient from "gel";

import {
  shutdown,
  applyMigrations,
  generateStatusFileName,
  getServerCommand,
  getWSLPath,
  startServer,
  runCommand,
  configToEnv,
} from "../../packages/gel/test/testUtil";

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
    await runCommand("yarn", ["test:ts"], configToEnv(config));
    await runCommand("yarn", ["test:non_ts"], configToEnv(config));
    try {
      await runCommand("yarn", ["bench:types"], configToEnv(config));
      await runCommand("yarn", ["bench:runtime"], configToEnv(config));
    } catch (err) {
      console.error("Benchmarking failed, proceeding anyway.");
      console.error(err);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    console.log("Shutting down Gel test cluster...");
    await shutdown(proc, managementConn);
    console.log("Gel test cluster is down...");
  }
})();
