# Sveltekit Integration Recipe for Gel

This recipe provides a starting point for building a [Sveltekit](https://kit.svelte.dev/) application with Gel as the database.

We try to actively monitor and incorporate significant changes from the original "create-app" templates to ensure developers have access to the latest features and best practices. However, we might not cover every possible configuration or permutation due to the vast scope of possibilities.

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

After running the command, you will be prompted to provide a project name and choose the **"Sveltekit"** template. You can also specify whether to use Gel Auth, initialize a git repository, and install dependencies.

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

Then choose the **"Sveltekit"** template.
