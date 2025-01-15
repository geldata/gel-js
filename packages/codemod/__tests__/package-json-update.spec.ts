import * as fs from 'fs/promises';
import * as glob from 'glob';
import { findAndUpdatePackageJson } from '../scripts/package-json-update';

jest.mock('fs/promises');
jest.mock('glob');

describe('Package JSON Update Script', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGlob = glob as jest.Mocked<typeof glob>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  it('should update dependencies and scripts in package.json', async () => {
    const mockPackageJson = {
      dependencies: {
        'edgedb': '^1.0.0',
        '@edgedb/generate': '^2.0.0',
        'other-pkg': '^3.0.0'
      },
      devDependencies: {
        '@edgedb/auth': '^1.0.0'
      },
      scripts: {
        generate: 'npx @edgedb/generate edgeql'
      }
    };

    mockGlob.sync.mockReturnValue(['/path/to/package.json']);
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));
    mockFs.writeFile.mockResolvedValue();

    await findAndUpdatePackageJson('/root');

    expect(mockGlob.sync).toHaveBeenCalledWith('**/package.json', {
      cwd: '/root',
      ignore: ['**/node_modules/**'],
      absolute: true
    });

    expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/package.json', 'utf8');

    const expectedPackageJson = {
      dependencies: {
        'other-pkg': '^3.0.0',
        'gel': '^1.0.0',
        '@gel/generate': '^2.0.0'
      },
      devDependencies: {
        '@gel/auth': '^1.0.0'
      },
      scripts: {
        generate: 'npx @gel/generate edgeql'
      }
    };

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/path/to/package.json',
      JSON.stringify(expectedPackageJson, null, 2) + '\n'
    );
  });

  it('should handle package.json without dependencies or scripts', async () => {
    const mockPackageJson = {
      name: 'test-package'
    };

    mockGlob.sync.mockReturnValue(['/path/to/package.json']);
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));
    mockFs.writeFile.mockResolvedValue();

    await findAndUpdatePackageJson('/root');

    expect(mockFs.readFile).toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('should handle file read errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    mockGlob.sync.mockReturnValue(['/path/to/package.json']);
    mockFs.readFile.mockRejectedValue(new Error('File read error'));

    await findAndUpdatePackageJson('/root');

    expect(consoleSpy).toHaveBeenCalledWith('Error:', 'Error processing /path/to/package.json: File read error');
  });

  it('should handle no package.json files found', async () => {
    mockGlob.sync.mockReturnValue([]);

    await findAndUpdatePackageJson('/root');

    expect(mockFs.readFile).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });
});