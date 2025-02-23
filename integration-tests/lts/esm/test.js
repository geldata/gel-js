import { createClient } from "gel";
import e from "./edgeql-js/index.mjs";
import { freeShape, scalarQuery } from "./queries.mjs";

const client = createClient();

async function run() {
  try {
    const result = await e
      .select({
        num: e.int64(35),
        msg: e.str("sup"),
      })
      .run(client);
    if (result.num !== 35) throw new Error();
    if (result.msg !== "sup") throw new Error();

    await scalarQuery(client);
    const movies = await freeShape(client, { data: "hi mom" });

    if (movies.data !== "hi mom") {
      throw new Error("Failure: --esm");
    }
    console.log(`Success: --target esm`);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

run();
