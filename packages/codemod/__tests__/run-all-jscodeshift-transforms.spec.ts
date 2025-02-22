import { defineTest } from 'jscodeshift/src/testUtils';

describe("imports rename", () => {
  defineTest(__dirname, './transforms/index', null, 'all-transforms/basic', { parser: 'ts' });
});
