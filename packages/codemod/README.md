# Codemod

- Main codemod script is `transform.ts`
- `transforms` contains different codemod scripts (imported and used in `transform.ts`)
- `__tests__` contains tests for the codemod
- `__testfixtures__` contains test fixtures

## Usage

```
yarn jscodeshift -t transform.ts <path>
```

TODO: We can wrap this in a CLI and pass options to the transforms.

## Tests

```
yarn test
```

Tests setup follows the [jscodeshift](https://github.com/facebook/jscodeshift?tab=readme-ov-file#unit-testing) documentation.

## Development

1. Add a new transform in `transforms` directory, e.g. `transforms/my-transform.ts`
2. Add a corresponding unit test in `__tests__` directory, e.g. `__tests__/my-transform.spec.ts`
3. Add test fixtures in `__testfixtures__` directory, e.g. `__testfixtures__/my-transform/basic.input.ts` and `__testfixtures__/my-transform/basic.output.ts`
4. Run tests with `yarn test`

