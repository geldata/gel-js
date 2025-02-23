# Express Integration Recipe for Gel

This recipe provides a starting point for building an [Express](https://expressjs.com/) application with Gel as the database.

✨ Check out the [`@gel/create` package](https://github.com/gel/gel-js/blob/master/packages/create/README.md) for more information.

## Usage

```bash
$ npm create @gel
# or
yarn create @gel
# or
pnpm create @gel
# or
bun create @gel
```

After running the command, you will be prompted to provide a project name and choose the **"Express"** template. You can also specify whether to use Gel Auth, initialize a git repository, and install dependencies.

The tool will then create a new directory with the specified name and set up the project.

## Local Recipe Development

Install dependencies in the root directory:

```bash
$ yarn
```

Navigate into `packages/create`:

```bash
$ cd packages/create
```

Build @gel/create

```bash
$ yarn build
```

Run a local version:

```bash
$ yarn run create
```

Then choose the **"Express"** template.
