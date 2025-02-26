import * as fs from 'fs/promises';
import * as glob from 'glob';
import { findAndUpdateFileExtensions } from '../scripts/esdl-to-gel-file-extensions-update';

jest.mock('fs/promises');
jest.mock('glob');

describe('ESDL to GEL Extension Update Script', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGlob = glob as jest.Mocked<typeof glob>;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  it('should rename .esdl files to .gel', async () => {
    mockGlob.sync.mockReturnValue(['/path/to/schema.esdl', '/path/to/types.esdl']);
    mockFs.rename.mockResolvedValue(undefined);

    await findAndUpdateFileExtensions('/root');

    expect(mockGlob.sync).toHaveBeenCalledWith('**/*.{esdl}', {
      cwd: '/root',
      ignore: ['**/node_modules/**'],
      absolute: true
    });

    expect(mockFs.rename).toHaveBeenCalledTimes(2);
    expect(mockFs.rename).toHaveBeenCalledWith('/path/to/schema.esdl', '/path/to/schema.gel');
    expect(mockFs.rename).toHaveBeenCalledWith('/path/to/types.esdl', '/path/to/types.gel');
  });

  it('should handle file rename errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    mockGlob.sync.mockReturnValue(['/path/to/schema.esdl']);
    mockFs.rename.mockRejectedValue(new Error('File rename error'));

    await findAndUpdateFileExtensions('/root');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error processing /path/to/schema.esdl: File rename error'
    );
  });

  it('should handle no files found', async () => {
    mockGlob.sync.mockReturnValue([]);

    await findAndUpdateFileExtensions('/root');

    expect(mockFs.rename).not.toHaveBeenCalled();
  });
});
