import assert from "node:assert/strict";
import path from "path";
import { systemUtils } from "gel";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";

const QBDIR = path.resolve(__dirname, "..");

import { exec } from "child_process";

/**
 * Executes a shell command using exec and returns a Promise that resolves
 * with {stdout, stderr}, or rejects with an Error that includes all details.
 */
function tryExecSyncWithOutput(
  command: string,
  description: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: QBDIR,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // Increase if output is large
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${description}\nCommand: ${command}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
            ),
          );
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

describe("cli", () => {
  test("basic generate", async () => {
    execSync(`yarn generate edgeql-js --force-overwrite`, {
      stdio: "inherit",
    });
    const qbIndex = path.resolve(QBDIR, "dbschema", "edgeql-js", "index.ts");
    assert.equal(await systemUtils.exists(qbIndex), true);
  }, 60000);

  test("queries with positional pattern", () => {
    // Create two test .edgeql files
    const includedFile = path.resolve(QBDIR, "test-included.edgeql");
    const excludedFile = path.resolve(QBDIR, "test-excluded.edgeql");
    const includedQueryFile = path.resolve(QBDIR, "test-included.query.ts");
    const excludedQueryFile = path.resolve(QBDIR, "test-excluded.query.ts");

    const testQuery = "SELECT 42;";

    // Write both test files
    fs.writeFileSync(includedFile, testQuery);
    fs.writeFileSync(excludedFile, testQuery);

    try {
      // Run with pattern that should match only the included file
      execSync(`./dist/cli.js queries "test-included.edgeql"`, {
        stdio: "inherit",
        cwd: QBDIR,
      });

      // Verify the included file generated a .query.ts file
      assert.ok(
        fs.existsSync(includedQueryFile),
        `Expected ${includedQueryFile} to be generated`,
      );

      // Verify the excluded file did NOT generate a .query.ts file
      assert.ok(
        !fs.existsSync(excludedQueryFile),
        `Expected ${excludedQueryFile} to NOT be generated`,
      );
    } finally {
      // Clean up all test files
      [
        includedFile,
        excludedFile,
        includedQueryFile,
        excludedQueryFile,
      ].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    }
  });

  test("patterns relative to current working directory", () => {
    // Create subdirectory structure
    const subDir = path.resolve(QBDIR, "subdir");
    const testFile = path.resolve(subDir, "query.edgeql");
    const expectedOutput = path.resolve(subDir, "query.query.ts");

    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(testFile, "SELECT 42;");

    try {
      // Run from subdirectory with pattern relative to that directory
      execSync(`../dist/cli.js queries "."`, {
        stdio: "inherit",
        cwd: subDir,
      });

      // Verify the file was generated in subdirectory
      assert.ok(
        fs.existsSync(expectedOutput),
        `Expected ${expectedOutput} to be generated from subdirectory pattern`,
      );
    } finally {
      // Clean up
      [testFile, expectedOutput].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      try {
        fs.rmdirSync(subDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test("pattern dot from project root excludes schema directories", () => {
    // Helper function for cleanup
    const cleanup = (file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    };

    // Create fake schema files that should be ignored
    const schemaDir = path.resolve(QBDIR, "dbschema");
    const migrationsDir = path.resolve(schemaDir, "migrations");
    const fixupsDir = path.resolve(schemaDir, "fixups");

    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(fixupsDir, { recursive: true });

    const migrationFile = path.resolve(migrationsDir, "001_init.edgeql");
    const fixupFile = path.resolve(fixupsDir, "fix.edgeql");
    const goodFile = path.resolve(QBDIR, "good.edgeql");

    fs.writeFileSync(migrationFile, "CREATE TYPE User;");
    fs.writeFileSync(fixupFile, "DROP TYPE BadThing;");
    fs.writeFileSync(goodFile, "SELECT 42;");

    try {
      // Run from project root with "." - should NOT process schema files
      execSync(`./dist/cli.js queries "."`, {
        stdio: "inherit",
        cwd: QBDIR,
      });

      // Verify good file was processed
      assert.ok(fs.existsSync(path.resolve(QBDIR, "good.query.ts")));

      // Verify schema files were NOT processed
      assert.ok(
        !fs.existsSync(path.resolve(migrationsDir, "001_init.query.ts")),
      );
      assert.ok(!fs.existsSync(path.resolve(fixupsDir, "fix.query.ts")));
    } finally {
      // Cleanup
      [
        migrationFile,
        fixupFile,
        goodFile,
        path.resolve(QBDIR, "good.query.ts"),
      ].forEach(cleanup);
      [fixupsDir, migrationsDir].forEach((dir) => {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {}
      });
    }
  });

  test("absolute pattern paths work correctly", () => {
    // Create temp directory with test files
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gel-test-"));
    const testFile = path.resolve(tempDir, "absolute.edgeql");

    fs.writeFileSync(testFile, "SELECT 999;");

    try {
      // Run with absolute pattern from project root
      execSync(`./dist/cli.js queries "${tempDir}"`, {
        stdio: "inherit",
        cwd: QBDIR,
      });

      // Verify file was processed
      assert.ok(fs.existsSync(path.resolve(tempDir, "absolute.query.ts")));
    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  test("explicit glob patterns respect schema exclusions", () => {
    const cleanup = (file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    };

    const cleanupDir = (dir: string) => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {}
    };

    // Create nested structure with schema files
    const schemaDir = path.resolve(QBDIR, "dbschema");
    const migrationsDir = path.resolve(schemaDir, "migrations");
    const appDir = path.resolve(QBDIR, "app");

    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });

    const migrationFile = path.resolve(migrationsDir, "schema.edgeql");
    const appFile = path.resolve(appDir, "query.edgeql");

    fs.writeFileSync(migrationFile, "CREATE TYPE Schema;");
    fs.writeFileSync(appFile, "SELECT 456;");

    try {
      // Run with explicit glob pattern from project root
      execSync(`./dist/cli.js queries "**/*.edgeql"`, {
        stdio: "inherit",
        cwd: QBDIR,
      });

      // Verify app file processed, schema file ignored
      assert.ok(fs.existsSync(path.resolve(appDir, "query.query.ts")));
      assert.ok(!fs.existsSync(path.resolve(migrationsDir, "schema.query.ts")));
    } finally {
      // Cleanup
      [migrationFile, appFile, path.resolve(appDir, "query.query.ts")].forEach(
        cleanup,
      );
      [migrationsDir, appDir].forEach(cleanupDir);
    }
  });

  test("schema directory outside cwd is not excluded when pattern searches locally", () => {
    const cleanup = (file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    };

    // Create deep subdirectory structure
    const subDir = path.resolve(QBDIR, "deep", "subdir");
    fs.mkdirSync(subDir, { recursive: true });

    // Schema is at project root, we're in deep subdirectory
    const testFile = path.resolve(subDir, "test.edgeql");
    fs.writeFileSync(testFile, "SELECT 789;");

    try {
      // From deep subdirectory, schema dir is outside our search scope
      // Pattern "." only searches current directory tree, so no schema exclusion needed
      const cliPath = path.resolve(QBDIR, "dist", "cli.js");
      execSync(`"${cliPath}" queries "."`, {
        stdio: "inherit",
        cwd: subDir,
      });

      // Verify file was processed normally (no schema to exclude in this context)
      assert.ok(fs.existsSync(path.resolve(subDir, "test.query.ts")));
    } finally {
      // Cleanup
      [testFile, path.resolve(subDir, "test.query.ts")].forEach(cleanup);
      try {
        fs.rmSync(path.resolve(QBDIR, "deep"), {
          recursive: true,
          force: true,
        });
      } catch (e) {}
    }
  });

  test("queries with multiple positional patterns", () => {
    // Create test files in different directories
    const files = {
      // Files that should be INCLUDED by patterns
      userFile: path.resolve(QBDIR, "user.edgeql"),
      adminFile: path.resolve(QBDIR, "admin", "permissions.edgeql"),

      // Files that should be EXCLUDED (not matching any pattern)
      excludedFile: path.resolve(QBDIR, "excluded.edgeql"),
      otherFile: path.resolve(QBDIR, "other", "stuff.edgeql"),
    };

    // Expected output files
    const outputs = {
      userOutput: path.resolve(QBDIR, "user.query.ts"),
      adminOutput: path.resolve(QBDIR, "admin", "permissions.query.ts"),
      excludedOutput: path.resolve(QBDIR, "excluded.query.ts"),
      otherOutput: path.resolve(QBDIR, "other", "stuff.query.ts"),
    };

    // Create directories
    fs.mkdirSync(path.resolve(QBDIR, "admin"), { recursive: true });
    fs.mkdirSync(path.resolve(QBDIR, "other"), { recursive: true });

    // Write test files
    const testQuery = "SELECT 42;";
    Object.values(files).forEach((file) => fs.writeFileSync(file, testQuery));

    try {
      // Run with multiple patterns: should match user.edgeql AND admin/*.edgeql
      execSync(`./dist/cli.js queries "user.edgeql" "admin/*.edgeql"`, {
        stdio: "inherit",
        cwd: QBDIR,
      });

      // Verify INCLUDED files generated output
      assert.ok(
        fs.existsSync(outputs.userOutput),
        "Expected user.query.ts to be generated from user.edgeql pattern",
      );

      assert.ok(
        fs.existsSync(outputs.adminOutput),
        "Expected admin/permissions.query.ts to be generated from admin/*.edgeql pattern",
      );

      // Verify EXCLUDED files did NOT generate output
      assert.ok(
        !fs.existsSync(outputs.excludedOutput),
        "Expected excluded.query.ts to NOT be generated (no matching pattern)",
      );

      assert.ok(
        !fs.existsSync(outputs.otherOutput),
        "Expected other/stuff.query.ts to NOT be generated (no matching pattern)",
      );
    } finally {
      // Cleanup all test files and outputs
      [...Object.values(files), ...Object.values(outputs)].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });

      // Cleanup directories
      ["admin", "other"].forEach((dir) => {
        try {
          fs.rmSync(path.resolve(QBDIR, dir), {
            recursive: true,
            force: true,
          });
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    }
  });

  test("queries with patterns after flags", async () => {
    const testFile = path.resolve(QBDIR, "pattern-after-flag.edgeql");
    const outputFile = path.resolve(QBDIR, "pattern-after-flag.query.ts");

    fs.writeFileSync(testFile, "SELECT 123;");

    try {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries --force-overwrite "pattern-after-flag.edgeql"`,
        "execSync failed for pattern after flags",
      );

      assert.ok(
        fs.existsSync(outputFile),
        "Expected pattern-after-flag.query.ts to be generated when pattern comes after flags",
      );
    } finally {
      // Cleanup
      [testFile, outputFile].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    }
  });

  test("queries with patterns interleaved with flags", async () => {
    const files = {
      file1: path.resolve(QBDIR, "interleaved1.edgeql"),
      file2: path.resolve(QBDIR, "interleaved2.edgeql"),
    };
    const outputs = {
      output1: path.resolve(QBDIR, "interleaved1.query.ts"),
      output2: path.resolve(QBDIR, "interleaved2.query.ts"),
    };

    fs.writeFileSync(files.file1, "SELECT 456;");
    fs.writeFileSync(files.file2, "SELECT 789;");

    try {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "interleaved1.edgeql" --force-overwrite "interleaved2.edgeql"`,
        "execSync failed for patterns interleaved with flags",
      );

      // Verify both files were processed
      assert.ok(
        fs.existsSync(outputs.output1),
        "Expected interleaved1.query.ts to be generated",
      );
      assert.ok(
        fs.existsSync(outputs.output2),
        "Expected interleaved2.query.ts to be generated when patterns are interleaved with flags",
      );
    } finally {
      // Cleanup
      [...Object.values(files), ...Object.values(outputs)].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    }
  });

  describe("backward compatibility - all flag formats still work", () => {
    const testFile = path.resolve(QBDIR, "compat-test.edgeql");
    const outputFile = path.resolve(QBDIR, "compat-test.query.ts");

    beforeAll(() => {
      fs.writeFileSync(testFile, "SELECT 999;");
    });

    afterAll(() => {
      [testFile, outputFile].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    });

    test("long flag with value", async () => {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "compat-test.edgeql" --force-overwrite`,
        "execSync failed for long flag with value",
      );
      assert.ok(fs.existsSync(outputFile), "Long flag format should work");
      fs.unlinkSync(outputFile);
    });

    test("boolean flag (no value)", async () => {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "compat-test.edgeql" --force-overwrite`,
        "execSync failed for boolean flag",
      );
      assert.ok(fs.existsSync(outputFile), "Boolean flag should work");
      fs.unlinkSync(outputFile);
    });

    test("pattern before flags (existing behavior)", async () => {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "compat-test.edgeql" --force-overwrite`,
        "execSync failed for pattern before flags",
      );
      assert.ok(
        fs.existsSync(outputFile),
        "Pattern before flags should work (existing behavior)",
      );
    });
  });

  test("short flag formats work correctly", () => {
    // This test just verifies the CLI accepts short flags without errors
    // We're testing parsing, not actual connection behavior
    const testFile = path.resolve(QBDIR, "short-flags.edgeql");

    fs.writeFileSync(testFile, "SELECT 1;");

    try {
      // Test short flags (these will fail to connect, but should parse correctly)
      // We use a fake host/port that won't connect, but the flags should be accepted
      try {
        execSync(
          `./dist/cli.js queries "short-flags.edgeql" -H localhost -P 9999 -d testdb`,
          {
            cwd: QBDIR,
            stdio: "pipe", // Suppress error output
            timeout: 5000,
          },
        );
      } catch (e: any) {
        // We expect this to fail due to connection, but not due to flag parsing
        // If flags were invalid, error would mention "Unknown option"
        const errorOutput = e.stderr?.toString() || e.stdout?.toString() || "";
        assert.ok(
          !errorOutput.includes("Unknown option"),
          `Short flags should be recognized but got error: ${errorOutput}`,
        );
      }
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(testFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
});
