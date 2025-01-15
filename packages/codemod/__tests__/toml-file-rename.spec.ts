import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { findAndUpdateToml } from '../scripts/edgeql-to-gel-file-extensions-update';

const FIXTURES_DIR = path.resolve('__testfixtures__');

describe('rename-toml transform', () => {
  const testInTomlPath = path.join(FIXTURES_DIR, 'edgedb.toml');
  const testOutTomlPath = path.join(FIXTURES_DIR, 'gel.toml');

  beforeEach(() => {
    // Mock console.log
    jest.spyOn(console, 'log').mockImplementation();
    // Create a test TOML file
    writeFileSync(testInTomlPath, `
[edgedb]
version = "x"
    `.trim());
  });

  afterEach(() => {
    if (existsSync(testInTomlPath)) {
      unlinkSync(testOutTomlPath);
    }
    if (existsSync(testOutTomlPath)) {
      unlinkSync(testOutTomlPath);
    }
  });

  it('should rename edgedb.toml file to gel.toml', async () => {
    await findAndUpdateToml(FIXTURES_DIR);

    expect(existsSync(testInTomlPath)).toBe(false);
    expect(existsSync(testOutTomlPath)).toBe(true);

    const content = readFileSync(testOutTomlPath, 'utf8');
    expect(content).toMatchSnapshot();
  });
});
