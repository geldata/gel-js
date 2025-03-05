import * as fs from "fs/promises";
import * as glob from "glob";

const dependenciesMap = {
  edgedb: ["gel", "^2.0.1"],
  "@edgedb/generate": ["@gel/generate", "^0.6.2"],
  "@edgedb/ai": ["@gel/ai", "^0.1.0"],
  "@edgedb/auth-core": ["@gel/auth-core", "^0.3.0"],
  "@edgedb/auth-nextjs": ["@gel/auth-nextjs", "^0.4.0"],
  "@edgedb/auth-express": ["@gel/auth-express", "^0.3.0"],
  "@edgedb/auth-sveltekit": ["@gel/auth-sveltekit", "^0.3.0"],
  "@edgedb/auth-remix": ["@gel/auth-remix", "^0.3.0"],
};

async function updatePackageJson(filePath: string): Promise<string[]> {
  const changes: string[] = [];

  try {
    const content = await fs.readFile(filePath, "utf8");
    const pkg = JSON.parse(content);
    let modified = false;

    for (const [oldPkg, [newPkg, version]] of Object.entries(dependenciesMap)) {
      if (pkg.dependencies?.[oldPkg]) {
        pkg.dependencies[newPkg] = version;
        delete pkg.dependencies[oldPkg];
        changes.push(
          `Replaced ${oldPkg} with ${newPkg}@${version} in dependencies`,
        );
        modified = true;
      }

      if (pkg.devDependencies?.[oldPkg]) {
        pkg.devDependencies[newPkg] = version;
        delete pkg.devDependencies[oldPkg];
        changes.push(
          `Replaced ${oldPkg} with ${newPkg}@${version} in devDependencies`,
        );
        modified = true;
      }
    }

    if (pkg.scripts) {
      const updatedScripts: Record<string, string> = {};

      for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
        const updatedValue = (scriptValue as string).replace(
          /@edgedb\/generate/g,
          "@gel/generate",
        );


        if (updatedValue !== scriptValue) {
          modified = true;
          updatedScripts[scriptName] = updatedValue;
          changes.push(
            `Updated script "${scriptName}": ${scriptValue} -> ${updatedValue}`,
          );
        }
      }

      if (
        Object.keys(updatedScripts).length > 0 &&
        Object.keys(updatedScripts).length === Object.keys(pkg.scripts).length
      ) {
        pkg.scripts = updatedScripts;
      }
    }

    if (modified) {
      await fs.writeFile(filePath, JSON.stringify(pkg, null, 2) + "\n");
    }

    return changes;
  } catch (error: any) {
    throw new Error(`Error processing ${filePath}: ${error.message}`);
  }
}

export async function findAndUpdatePackageJson(rootDir: string) {
  try {
    const files = glob.sync("**/package.json", {
      cwd: rootDir,
      ignore: ["**/node_modules/**"],
      absolute: true,
    });

    console.log(
      `Found ${files.length} package.json ${files.length === 1 ? "file" : "files"}`,
    );

    for (const file of files) {
      console.log(`Processing ${file}...`);
      const changes = await updatePackageJson(file);

      if (changes.length > 0) {
        console.log(`Changes in ${file}:`);
        changes.forEach((change) => console.log(`  - ${change}`));
      } else {
        console.log(`  No changes needed`);
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}
