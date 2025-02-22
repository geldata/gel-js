<div align="center">
  <h1>The official Node.js client library for Gel</h1>

  <a href="https://github.com/geldata/gel-js/actions" rel="nofollow">
    <img src="https://github.com/geldata/gel-js/actions/workflows/tests.yml/badge.svg?event=push&branch=master" alt="Build status">
  </a>
  <a href="https://www.npmjs.com/package/gel" rel="nofollow">
    <img src="https://img.shields.io/npm/v/gel" alt="NPM version">
  </a>
  <a href="https://github.com/geldata/gel" rel="nofollow">
    <img src="https://img.shields.io/github/stars/geldata/gel" alt="Stars">
  </a>
  <a href="https://github.com/geldata/gel/blob/master/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
  </a>
  <br />
  <br />
  <a href="https://www.geldata.com/docs/guides/quickstart">Quickstart</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://www.geldata.com">Website</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://www.geldata.com/docs/clients/js/index">Docs</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://discord.gg/umUueND6ag">Discord</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://twitter.com/usegel">Twitter</a>
  <br />

</div>

This is the official [Gel](https://github.com/geldata/gel) client library
for JavaScript and TypeScript.

If you're just getting started with Gel, we recommend going through the
[Gel Quickstart](https://www.geldata.com/docs/quickstart) first. This walks
you through the process of installing Gel, creating a simple schema, and
writing some simple queries.

### Requirements

- Node.js 18+
- For TypeScript users:
  - TypeScript 4.4+ is required
  - `yarn add @types/node --dev`

### Installation

```bash
npm install gel      # npm users
yarn add gel         # yarn users
```

> Gel 2.x requires `v0.21.0` or later

## Basic usage

> The examples below demonstrate only the most fundamental use cases for this
> library. **[Go to the complete documentation site. >](https://www.geldata.com/docs/clients/js/index)**

### Create a client

A _client_ is an instance of the `Client` class, which maintains a pool of
connections to your database and provides methods for executing queries.

_For TypeScript (and Node.js+ESM)_

```ts
import * as gel from "gel";

const client = gel.createClient();
```

_For Node.js (CommonJS)_

```js
const gel = require("gel");

const client = gel.createClient();
```

### Configuring the connection

The call to `gel.createClient()` doesn't require arguments, as the library
can determine how to connect to your database using the following mechanisms.

1. _For local development_: initialize a project with the `gel project init`
   command. As long as the file is within a project directory, `createClient`
   will be able to auto-discover the connection information of the project's
   associated instance. For more information on projects, follow the
   [Using projects](https://www.geldata.com/docs/guides/projects) guide.

2. _In production_: configure the connection using **environment variables**.
   (This can also be used during local development if you prefer.) The easiest
   way is to set the `GEL_DSN` variable; a DSN (also known as a "connection
   string") is a string of the form
   `gel://USERNAME:PASSWORD@HOSTNAME:PORT/DATABASE`.

For advanced cases, see the
[DSN specification](https://www.geldata.com/docs/reference/dsn) and
[Reference > Connection Parameters](https://www.geldata.com/docs/reference/connection).

### Run a query

> The remainder of the documentation assumes you are using ES module (`import`)
> syntax.

```ts
import * as gel from "gel";

const client = gel.createClient();
await client.query("select 2 + 2"); // => [4]
```

Note that the result is an _array_. The `.query()` method always returns an
array, regardless of the result cardinality of your query. If your query
returns _zero or one elements_, use the `.querySingle()` instead.

```ts
// empty set, zero elements
await client.querySingle("select <str>{}"); // => null

// one element
await client.querySingle("select 2 + 2"); // => 4

// one element
await client.querySingle(
  `select Movie { title }
  filter .id = <uuid>'2eb3bc76-a014-45dc-af66-2e6e8cc23e7e';`,
); // => { title: "Dune" }
```

## Generators

Install the `@gel/generate` package as a dev dependency to take advantage of Gel's built-in code generators.

```bash
npm install @gel/generate  --save-dev      # npm users
yarn add @gel/generate --dev               # yarn users
```

Then run a generator with the following command:

```bash
$ npx @gel/generate <generator> [FLAGS]
```

The following `<generator>`s are currently supported:

- `queries`: Generate typed functions from `*.edgeql` files
- `interfaces`: Generate interfaces for your schema types
- `edgeql-js`: Generate the query builder

### `queries`

Run the following command to generate a source file for each `*.edgeql` system in your project.

```bash
$ npx @gel/generate queries
```

Assume you have a file called `getUser.edgeql` in your project directory.

```
// getUser.edgeql
select User {
  name,
  email
}
filter .email = <str>$email;
```

This generator will generate a `getUser.query.ts` file alongside it that exports a function called `getUser`.

```ts
import { createClient } from "gel";
import { myQuery } from "./myQuery.query";

const client = createClient();

const user = await myQuery(client, { name: "Timmy" });
user; // {name: string; email: string}
```

The first argument is a `Client`, the second is the set of _parameters_. Both the parameters and the returned value are fully typed.

### `edgeql-js` (query builder)

The query builder lets you write queries in a code-first way. It automatically infers the return type of your queries.

To generate the query builder, install the `gel` package, initialize a project (if you haven't already), then run the following command:

```bash
$ npx @gel/generate edgeql-js
```

This will generate an EdgeQL query builder into the `./dbschema/edgeql-js`
directory, as defined relative to your project root.

For details on generating the query builder, refer to the [complete documentation](https://www.geldata.com/docs/clients/js/generation). Below is a simple `select` query as an example.

```ts
import { createClient } from "gel";
import e from "./dbschema/edgeql-js";

const client = createClient();
const query = e.select(e.Movie, (movie) => ({
  id: true,
  title: true,
  actors: { name: true },
  num_actors: e.count(movie.actors),
  filter_single: e.op(movie.title, "=", "Dune"),
}));

const result = await query.run(client);
result.actors[0].name; // => Timothee Chalamet
```

For details on using the query builder, refer to the full [query builder docs](https://www.geldata.com/docs/clients/js/querybuilder).

## Contribute

Contributing to this library requires a local installation of Gel. Install
Gel from [here](https://www.geldata.com/download) or
[build it from source](https://www.geldata.com/docs/reference/dev).

```bash
$ git clone git@github.com:gel/gel-js.git
$ cd gel-js
$ yarn                # install dependencies
$ yarn run build      # build all packages
$ yarn run test       # run tests for all packages
```

> In order to be able to run all tests you need to have `gel-server` in your
> path. This can be done by either running tests from within a Python 3.12
> virtual environment (you will have it if you built Gel locally), or by
> [installing](https://docs.geldata.com/cli/gel_server/gel_server_install#ref-cli-gel-server-install)
> specific Gel version and then adding its binary path to the `GEL_SERVER_BIN` environment variable.
> Check [here](https://docs.geldata.com/cli/gel_server/gel_server_info#ref-cli-gel-server-info)
> to find how to get the binary path.

## License

`gel-js` is developed and distributed under the Apache 2.0 license.
