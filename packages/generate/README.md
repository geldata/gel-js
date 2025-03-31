# `@gel/generate`: Code generation tools for Gel

The `@gel/generate` package implements a set of code generation tools that are useful when developing an Gel-backed applications with TypeScript/JavaScript.

✨ [View Documentation >>](https://docs.geldata.com/reference/clients/js/queries)

## Installation

> If you're using Deno, you can skip this step.

Install the `gel` package.

```bash
$ npm install gel       # npm users
$ yarn add gel          # yarn users
```

Then install `@gel/generate` as a dev dependency.

```bash
$ npm install @gel/generate --save-dev      # npm users
$ yarn add @gel/generate --dev              # yarn users
```

## Run a generator

Run a generator with the following command.

**Node.js**

```bash
$ npx @gel/generate <generator> [options]
```

**Deno**

```bash
$ deno run --allow-all npm:@gel/generate <generator> [options]
```

The value of `<generator>` should be one of the following.

- `queries`: This generator scans your project for `*.edgeql` files and generates a file containing a strongly-typed function for each.
- `edgeql-js`: This generator introspects your database schema and generates a query builder.
- `interfaces`: This generator introspects your database schema and generates TypeScript interfaces for each object type.

## Third-party generators

✨ If you build a code generator for Gel, ping us or open a PR and we'll list it here! ✨

The `gel` package exports a set of utilities to introspect the schema and analyze queries. We use this same set of tools to implement the first-party generators.

```ts
import { createClient, $ } from "gel";

const client = createClient();

const types = await $.introspect.types(client);
// Map<string, Type>

const queryData = await $.analyzeQuery(client, `select 2 + 2`);
// {args: string; result: string; ...}
```

## Contributing

If you want to implement a code generator, please open an issue first. This package only contains first-party generators with widespread appeal. From the root directory:

```
yarn
yarn workspaces run build  # build all packages
```

Navigate into `packages/generate`:

Build `@gel/generate`

```
yarn build
```

Build without typechecking (uses `esbuild`):

```
yarn build:fast
```

Run a generator:

```
npx @gel/generate edgeql-js    # query builder
npx @gel/generate queries      # query files
```

Execute `playground.ts` (uses `tsx`). Useful for testing things quickly in development:

```
yarn play
```

> ⚠️ All imports from `"gel"` resolve to the local build version of the driver in `packages/gel/dist`. This imports the _built_ library, not the so you need to re-run `yarn workspace gel build` for changes to be reflected in your playground code. Run `yarn dev` watcher inside `packages/gel` to rebuild the project anytime you make a change.

Run commands in watch mode. Useful when in development. The following command rebuilds the package and executes the playground whenever a file change is detected.

```
yarn watch 'yarn build:fast && yarn play`
```

Run tests.

```
yarn test
```
