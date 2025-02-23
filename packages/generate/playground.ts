// tslint:disable:no-console
import { setupTests } from "./test/setupTeardown";
import e from "./dbschema/edgeql-js";
import { createClient } from "gel";

const client = createClient();

async function run() {
  const { client } = await setupTests();

  const query = e.params({ title: e.optional(e.str) }, (params) => {
    return e.update(e.Movie, (m) => ({
      filter_single: { title: "not a real title" },
      set: {
        // Error here
        title: params.title,
      },
    }));
  });

  console.log(query.toEdgeQL());

  const result = await query.run(client, { title: "asdf" });

  console.log(result);
}

run();
