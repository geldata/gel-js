// tslint:disable:no-console
const { createClient } = require("gel");
const e = require("./edgeql-js").default;
const { freeShape, scalarQuery } = require("./queries");

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
    const movies = await freeShape(client, { data: "hello world" });

    if (movies.data !== "hello world") {
      throw new Error("Failure: --cjs");
    }

    console.log(`Success: --target cjs`);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

run();
