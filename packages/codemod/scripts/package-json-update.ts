import * as fs from 'fs/promises';
import * as glob from 'glob';

const dependenciesMap = {
  'edgedb': 'gel',
  '@edgedb/generate': '@gel/generate',
  '@edgedb/auth': '@gel/auth',
  '@edgedb/auth-core': '@gel/auth-core',
  '@edgedb/auth-nextjs': '@gel/auth-nextjs',
  '@edgedb/ai': '@gel/ai',
  '@edgedb/auth-express': '@gel/auth-express',
  '@edgedb/auth-sveltekit': '@gel/auth-sveltekit',
  '@edgedb/auth-remix': '@gel/auth-remix',
};

async function updatePackageJson(filePath: string): Promise<string[]> {
  const changes: string[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const pkg = JSON.parse(content);
    let modified = false;

    for (const [oldPkg, newPkg] of Object.entries(dependenciesMap)) {
      if (pkg.dependencies?.[oldPkg]) {
        pkg.dependencies[newPkg] = pkg.dependencies[oldPkg];
        delete pkg.dependencies[oldPkg];
        changes.push(`Replaced ${oldPkg} with ${newPkg} in dependencies`);
        modified = true;
      }

      if (pkg.devDependencies?.[oldPkg]) {
        pkg.devDependencies[newPkg] = pkg.devDependencies[oldPkg];
        delete pkg.devDependencies[oldPkg];
        changes.push(`Replaced ${oldPkg} with ${newPkg} in devDependencies`);
        modified = true;
      }
    }

    if (pkg.scripts) {
      const updatedScripts: Record<string, string> = {};

      for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
        const updatedValue = (scriptValue as string)
          .replace(/@edgedb\/generate/g, '@gel/generate');

        updatedScripts[scriptName] = updatedValue;

        if (updatedValue !== scriptValue) {
          modified = true;
          changes.push(`Updated script "${scriptName}": ${scriptValue} -> ${updatedValue}`);
        }
      }

      if (Object.keys(updatedScripts).length > 0 && Object.keys(updatedScripts).length === Object.keys(pkg.scripts).length) {
        pkg.scripts = updatedScripts;
      }
    }

    if (modified) {
      await fs.writeFile(filePath, JSON.stringify(pkg, null, 2) + '\n');
    }

    return changes;
  } catch (error: any) {
    throw new Error(`Error processing ${filePath}: ${error.message}`);
  }
}

export async function findAndUpdatePackageJson(rootDir: string) {
  try {
    const files = glob.sync('**/package.json', {
      cwd: rootDir,
      ignore: ['**/node_modules/**'],
      absolute: true
    });

    console.log(`Found ${files.length} package.json ${files.length === 1 ? 'file' : 'files'}`);

    for (const file of files) {
      console.log(`Processing ${file}...`);
      const changes = await updatePackageJson(file);

      if (changes.length > 0) {
        console.log(`Changes in ${file}:`);
        changes.forEach(change => console.log(`  - ${change}`));
      } else {
        console.log(`  No changes needed`);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}
