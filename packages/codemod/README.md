# Codemod

- CLI entry point is `cli.ts`
- `scripts` has custom scripts like changing file names, etc.
- `transforms` contains different codemod scripts (imported and used in `transforms/index.ts`)
- `__tests__` contains tests for the codemod
- `__testfixtures__` contains test fixtures

## Usage

```
yarn codemod <path-to-directory>
```

## Tests

```
yarn test
```

Tests setup follows the [jscodeshift](https://github.com/facebook/jscodeshift?tab=readme-ov-file#unit-testing) documentation.

## Development

JSCodeShift transforms:
1. Add a new transform in `transforms` directory, e.g. `transforms/my-transform.ts`
2. Add a corresponding unit test in `__tests__` directory, e.g. `__tests__/my-transform.spec.ts`
3. Add test fixtures in `__testfixtures__` directory, e.g. `__testfixtures__/my-transform/basic.input.ts` and `__testfixtures__/my-transform/basic.output.ts`
4. Add a new entry in `transforms/index.ts` to use the new transform
4. Run tests with `yarn test`

Custom scripts:
1. Add a new script in `scripts` directory, e.g. `scripts/my-script.ts`
2. Use it in `cli.ts`

