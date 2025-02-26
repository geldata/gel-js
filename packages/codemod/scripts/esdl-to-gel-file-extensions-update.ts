import * as fs from 'fs/promises';
import * as glob from 'glob';

async function updateEsdlToGelExt(filePath: string): Promise<string[]> {
  const changes: string[] = [];

  try {
    await fs.rename(filePath, filePath.replace(/\.(esdl)$/, '.gel'));
    changes.push(`Updated file extension from .esdl to .gel`);

    return changes;
  }

  catch (error: any) {
    throw new Error(`Error processing ${filePath}: ${error.message}`);
  }
}

export async function findAndUpdateFileExtensions(rootDir: string) {
  try {
    const files = glob.sync('**/*.{esdl}', {
      cwd: rootDir,
      ignore: ['**/node_modules/**'],
      absolute: true
    });

    console.log(`Found ${files.length} ${files.length === 1 ? 'file' : 'files'
      } with .esdl extension`);

    for (const file of files) {
      console.log(`Processing ${file}...`);
      try {
        const changes = await updateEsdlToGelExt(file);
        console.log('Changes made:');
        changes.forEach(change => console.log(`  - ${change}`));
      } catch (error: any) {
        console.error(error.message);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

