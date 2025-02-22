import path from "path";
import { execSync } from "child_process";
import { createClient } from "gel";

const QBDIR = "./dbschema/qbout";

const client = createClient();

const CMD = [
  `yarn generate edgeql-js`,
  `--output-dir ./dbschema/qbout`,
  `--force-overwrite`,
  "--target esm",
];

async function run() {
  try {
    console.log(process.version);
    if (parseInt(process.version.slice(1)) < 14) {
      console.log(`Node.js version is <14. Skipping ESM test.`);
      return;
    }
    execSync(CMD.join(" "));
    const indexFilePath = path.posix.join(QBDIR, "index.mjs");
    const { default: e } = await import(indexFilePath);
    const result = await e.str("Hello world!").run(client);
    if (result !== "Hello world!") throw new Error();
    console.log(`ESM tests successful.`);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

run();
