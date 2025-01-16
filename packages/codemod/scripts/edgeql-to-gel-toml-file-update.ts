import * as fs from 'fs/promises';
import * as path from 'path';
import * as glob from 'glob';

async function updateTomlContent(content: string): Promise<string> {
  return content
    .replace(/\[edgedb\]/g, '[gel]');
}

async function processTomlFile(filePath: string): Promise<string[]> {
  const changes: string[] = [];
  const newPath = filePath.replace(/edgedb\.toml$/, 'gel.toml');

  try {
    const content = await fs.readFile(filePath, 'utf8');

    const updatedContent = await updateTomlContent(content);

    await fs.writeFile(newPath, updatedContent);
    changes.push(`Created ${path.basename(newPath)}`);

    await fs.unlink(filePath);
    changes.push(`Removed ${path.basename(filePath)}`);

    return changes;
  } catch (error: any) {
    throw new Error(`Error processing ${filePath}: ${error.message}`);
  }
}

export async function findAndUpdateToml(rootDir: string) {
  try {
    const files = glob.sync('**/edgedb.toml', {
      cwd: rootDir,
      ignore: ['**/node_modules/**'],
      absolute: true
    });

    console.log(`Found ${files.length} edgedb.toml files`);

    for (const file of files) {
      console.log(`Processing ${file}...`);
      try {
        const changes = await processTomlFile(file);
        console.log('Changes made:');
        changes.forEach(change => console.log(`  - ${change}`));
      } catch (error: any) {
        console.error(`Error processing ${file}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

