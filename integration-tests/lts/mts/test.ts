// tslint:disable:no-console

// import {setupTests} from "./test/setupTeardown";
import { createClient } from "gel";
import e from "./edgeql-js/index.mjs";
import { freeShape, scalarQuery } from "./queries.mjs";

async function run() {
  try {
    const client = createClient();
    const query = e.select({
      num: e.int64(35),
      msg: e.str("Hello world"),
    });

    const result = await query.run(client);
    if (result.msg !== "Hello world" || result.num !== 35) {
      throw new Error();
    }

    await scalarQuery(client);
    const shapeData = await freeShape(client, { data: "Iron Man" });

    if (shapeData.data !== "Iron Man") {
      throw new Error("Failure: --mts");
    }

    console.log(`Success: --target mts`);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

run();
export {};
