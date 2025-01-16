import { defineTest } from 'jscodeshift/src/testUtils';

describe("imports rename", () => {
  defineTest(__dirname, './transforms/imports-rename', null, 'imports-rename/basic', { parser: 'ts' });
});
