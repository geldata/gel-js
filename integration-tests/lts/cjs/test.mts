// tslint:disable:no-console

// import {setupTests} from "./test/setupTeardown";
import { createClient } from "gel";
import e from "./edgeql-js/index.js";

const client = createClient();

const query = e.select({
  num: e.default.int64(35),
  msg: e.default.str("Hello world"),
});

const result = await query.run(client);
if (result.msg !== "Hello world" || result.num !== 35) {
  throw new Error();
}
console.log(result);
