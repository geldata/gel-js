import { Bench } from "tinybench";
import { createClient } from "gel";
import e from "./mts/edgeql-js/index.mjs";

const client = createClient();

const bench = new Bench({
  name: "Query throughput",
  warmup: true,

  setup: async (_task, mode) => {
    if (mode === "warmup") {
      await client.ensureConnected();
    }
  },
  time: 5_000,
});

bench.add("simple select", async () => {
  const q = e.select(e.Hero, () => ({
    limit: 1,
  }));

  await q.run(client);
});

bench.add("complex nested insert", async () => {
  const q = e
    .insert(e.Movie, {
      title: "The Matrix",
      genre: "Science Fiction",
      rating: 8.7,
      release_year: 1999,
      characters: e.select(e.Hero),
    })
    .unlessConflict();

  await q.run(client);
});

bench.add(
  "complex select: polymorphic link properties in expressions",
  async () => {
    const query = e.select(e.Object, () => ({
      id: true,
      ...e.is(e.Movie, {
        title: true,
        characters: (char) => ({
          name: true,
          "@character_name": true,
          char_name: char["@character_name"],
          person_name: char.name,

          filter: e.op(char["@character_name"], "ilike", "a%"),
        }),
      }),
    }));

    await query.run(client);
  },
);

await bench.run();

console.table(
  bench.table((t) => {
    if (!t.result) {
      return {
        name: t.name,
        mean: "N/A",
        median: "N/A",
        samples: 0,
      };
    }
    const { error, throughput } = t.result;
    if (error) {
      return {
        name: t.name,
        Error: error.message,
        Stack: error.stack,
      };
    }
    return {
      name: t.name,
      mean: `${Math.round(throughput.mean).toString()} \xb1 ${throughput.rme.toFixed(2)}%`,
      median: `${Math.round(throughput.p50!).toString()} \xb1 ${Math.round(throughput.mad!).toString()}`,
    };
  }),
);
