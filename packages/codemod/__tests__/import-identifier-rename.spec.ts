import { defineTest } from 'jscodeshift/src/testUtils';

describe("imports rename", () => {
  defineTest(__dirname, './transforms/import-identifier-rename', null, 'import-identifier-rename/basic', { parser: 'ts' });
});
