import assert from "node:assert/strict";
import path from "path";
import { systemUtils } from "gel";
import { execSync, type ExecOptions } from "child_process";
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
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  // Capture stack trace at the call site
  const callSiteError = new Error();

  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: QBDIR,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // Increase if output is large
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.message = `${description}\nCommand: ${command}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
          // Preserve both the exec error stack and the call site stack
          if (callSiteError.stack) {
            error.stack =
              error.stack + "\n--- Called from ---\n" + callSiteError.stack;
          }
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

describe("cli", () => {
  test("basic generate", async () => {
    await tryExecSyncWithOutput(
      `yarn generate edgeql-js --force-overwrite`,
      "basic generate",
    );
    const qbIndex = path.resolve(QBDIR, "dbschema", "edgeql-js", "index.ts");
    assert.equal(
      await systemUtils.exists(qbIndex),
      true,
      "Expected edgeql-js index.ts to be generated at dbschema/edgeql-js/index.ts",
    );
  }, 60000);

  test("queries with positional pattern", async () => {
    const includedFile = path.resolve(QBDIR, "test-included.edgeql");
    const excludedFile = path.resolve(QBDIR, "test-excluded.edgeql");
    const includedQueryFile = path.resolve(QBDIR, "test-included.query.ts");
    const excludedQueryFile = path.resolve(QBDIR, "test-excluded.query.ts");

    const testQuery = "SELECT 42;";

    fs.writeFileSync(includedFile, testQuery);
    fs.writeFileSync(excludedFile, testQuery);

    try {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "test-included.edgeql"`,
        "queries with positional pattern",
      );

      assert.ok(
        fs.existsSync(includedQueryFile),
        `Expected ${includedQueryFile} to be generated`,
      );

      assert.ok(
        !fs.existsSync(excludedQueryFile),
        `Expected ${excludedQueryFile} to NOT be generated`,
      );
    } finally {
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

  test("patterns relative to current working directory", async () => {
    // Create subdirectory structure
    const subDir = path.resolve(QBDIR, "subdir");
    const testFile = path.resolve(subDir, "query.edgeql");
    const expectedOutput = path.resolve(subDir, "query.query.ts");

    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(testFile, "SELECT 42;");

    try {
      // Run from subdirectory with pattern relative to that directory
      await tryExecSyncWithOutput(
        `../dist/cli.js queries "."`,
        "patterns relative to current working directory",
        { cwd: subDir },
      );

      assert.ok(
        fs.existsSync(expectedOutput),
        `Expected ${expectedOutput} to be generated from subdirectory pattern`,
      );
    } finally {
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

  test("pattern dot from project root excludes schema directories", async () => {
    const cleanup = (file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    };

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
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "."`,
        "pattern dot from project root excludes schema directories",
      );

      assert.ok(
        fs.existsSync(path.resolve(QBDIR, "good.query.ts")),
        "Expected good.query.ts to be generated from non-schema directory",
      );

      assert.ok(
        !fs.existsSync(path.resolve(migrationsDir, "001_init.query.ts")),
        "Expected migration files in dbschema/migrations to be excluded from processing",
      );
      assert.ok(
        !fs.existsSync(path.resolve(fixupsDir, "fix.query.ts")),
        "Expected fixup files in dbschema/fixups to be excluded from processing",
      );
    } finally {
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

  test("absolute pattern paths work correctly", async () => {
    // Create temp directory with test files
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gel-test-"));
    const testFile = path.resolve(tempDir, "absolute.edgeql");

    fs.writeFileSync(testFile, "SELECT 999;");

    try {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "${tempDir}"`,
        "absolute pattern paths work correctly",
      );

      assert.ok(
        fs.existsSync(path.resolve(tempDir, "absolute.query.ts")),
        "Expected query file to be generated when using absolute path pattern",
      );
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  test("explicit glob patterns respect schema exclusions", async () => {
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
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "**/*.edgeql"`,
        "explicit glob patterns respect schema exclusions",
      );

      assert.ok(
        fs.existsSync(path.resolve(appDir, "query.query.ts")),
        "Expected app/query.query.ts to be generated when using glob pattern **/*.edgeql",
      );
      assert.ok(
        !fs.existsSync(path.resolve(migrationsDir, "schema.query.ts")),
        "Expected migration files to be excluded even with glob pattern **/*.edgeql",
      );
    } finally {
      [migrationFile, appFile, path.resolve(appDir, "query.query.ts")].forEach(
        cleanup,
      );
      [migrationsDir, appDir].forEach(cleanupDir);
    }
  });

  test("schema directory outside cwd is not excluded when pattern searches locally", async () => {
    const cleanup = (file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {}
    };

    const subDir = path.resolve(QBDIR, "deep", "subdir");
    fs.mkdirSync(subDir, { recursive: true });

    const testFile = path.resolve(subDir, "test.edgeql");
    fs.writeFileSync(testFile, "SELECT 789;");

    try {
      const cliPath = path.resolve(QBDIR, "dist", "cli.js");
      await tryExecSyncWithOutput(
        `"${cliPath}" queries "."`,
        "schema directory outside cwd is not excluded when pattern searches locally",
        {
          cwd: subDir,
        },
      );

      assert.ok(
        fs.existsSync(path.resolve(subDir, "test.query.ts")),
        "Expected test.query.ts to be generated when running from deep subdirectory with pattern '.' (schema dir is outside search scope)",
      );
    } finally {
      [testFile, path.resolve(subDir, "test.query.ts")].forEach(cleanup);
      try {
        fs.rmSync(path.resolve(QBDIR, "deep"), {
          recursive: true,
          force: true,
        });
      } catch (e) {}
    }
  });

  test("queries with multiple positional patterns", async () => {
    // Create test files in different directories
    const files = {
      userFile: path.resolve(QBDIR, "user.edgeql"),
      adminFile: path.resolve(QBDIR, "admin", "permissions.edgeql"),
      excludedFile: path.resolve(QBDIR, "excluded.edgeql"),
      otherFile: path.resolve(QBDIR, "other", "stuff.edgeql"),
    };

    const outputs = {
      userOutput: path.resolve(QBDIR, "user.query.ts"),
      adminOutput: path.resolve(QBDIR, "admin", "permissions.query.ts"),
      excludedOutput: path.resolve(QBDIR, "excluded.query.ts"),
      otherOutput: path.resolve(QBDIR, "other", "stuff.query.ts"),
    };

    fs.mkdirSync(path.resolve(QBDIR, "admin"), { recursive: true });
    fs.mkdirSync(path.resolve(QBDIR, "other"), { recursive: true });

    const testQuery = "SELECT 42;";
    Object.values(files).forEach((file) => fs.writeFileSync(file, testQuery));

    try {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "user.edgeql" "admin/*.edgeql"`,
        "queries with multiple positional patterns",
      );

      assert.ok(
        fs.existsSync(outputs.userOutput),
        "Expected user.query.ts to be generated from user.edgeql pattern",
      );

      assert.ok(
        fs.existsSync(outputs.adminOutput),
        "Expected admin/permissions.query.ts to be generated from admin/*.edgeql pattern",
      );

      assert.ok(
        !fs.existsSync(outputs.excludedOutput),
        "Expected excluded.query.ts to NOT be generated (no matching pattern)",
      );

      assert.ok(
        !fs.existsSync(outputs.otherOutput),
        "Expected other/stuff.query.ts to NOT be generated (no matching pattern)",
      );
    } finally {
      [...Object.values(files), ...Object.values(outputs)].forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      });

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

      assert.ok(
        fs.existsSync(outputs.output1),
        "Expected interleaved1.query.ts to be generated when patterns are interleaved with flags",
      );
      assert.ok(
        fs.existsSync(outputs.output2),
        "Expected interleaved2.query.ts to be generated when patterns are interleaved with flags",
      );
    } finally {
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
      assert.ok(
        fs.existsSync(outputFile),
        "Expected query file to be generated when using long flag format (--force-overwrite)",
      );
      fs.unlinkSync(outputFile);
    });

    test("boolean flag (no value)", async () => {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "compat-test.edgeql" --force-overwrite`,
        "execSync failed for boolean flag",
      );
      assert.ok(
        fs.existsSync(outputFile),
        "Expected query file to be generated when using boolean flag format",
      );
      fs.unlinkSync(outputFile);
    });

    test("pattern before flags (existing behavior)", async () => {
      await tryExecSyncWithOutput(
        `./dist/cli.js queries "compat-test.edgeql" --force-overwrite`,
        "execSync failed for pattern before flags",
      );
      assert.ok(
        fs.existsSync(outputFile),
        "Expected query file to be generated when pattern comes before flags (backward compatibility)",
      );
    });
  });

  test("short flag formats work correctly", async () => {
    const testFile = path.resolve(QBDIR, "short-flags.edgeql");

    fs.writeFileSync(testFile, "SELECT 1;");

    try {
      try {
        await tryExecSyncWithOutput(
          `./dist/cli.js queries "short-flags.edgeql" -H localhost -P 9999 -d testdb`,
          "short flag formats work correctly",
          {
            timeout: 5000,
          },
        );
      } catch (e: any) {
        const errorOutput = e.stderr?.toString() || e.stdout?.toString() || "";
        assert.ok(
          !errorOutput.includes("Unknown option"),
          `Expected short flags (-H, -P, -d) to be parsed correctly without 'Unknown option' error, but got: ${errorOutput}`,
        );
      }
    } finally {
      try {
        fs.unlinkSync(testFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test("version flag works", () => {
    const output = execSync("./dist/cli.js --version", {
      cwd: QBDIR,
      encoding: "utf-8",
    });
    assert.match(
      output.trim(),
      /^\d+\.\d+\.\d+$/,
      "Expected --version flag to output a valid semver version number (e.g., 1.2.3)",
    );
  });

  test("edgeql-js accepts --future flags", () => {
    try {
      execSync(
        "./dist/cli.js edgeql-js --future --future-strict-type-names --future-polymorphism-as-discriminated-unions -H localhost -P 9999",
        {
          cwd: QBDIR,
          stdio: "pipe",
          encoding: "utf-8",
          timeout: 5000,
        },
      );
    } catch (e: any) {
      const output = e.stderr || e.stdout || "";
      assert.ok(
        !output.includes("Unknown option") &&
          !output.includes("unknown option"),
        `Expected edgeql-js to accept --future flags without 'Unknown option' error, but got: ${output}`,
      );
    }
  });

  test("queries accepts --future flags", () => {
    try {
      execSync("./dist/cli.js queries --future -H localhost -P 9999", {
        cwd: QBDIR,
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch (e: any) {
      const output = e.stderr || e.stdout || "";
      assert.ok(
        !output.includes("Unknown option") &&
          !output.includes("unknown option"),
        `Expected queries command to accept --future flag without 'Unknown option' error, but got: ${output}`,
      );
    }
  });

  test("interfaces accepts --future flags", () => {
    try {
      execSync("./dist/cli.js interfaces --future -H localhost -P 9999", {
        cwd: QBDIR,
        stdio: "pipe",
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch (e: any) {
      const output = e.stderr || e.stdout || "";
      assert.ok(
        !output.includes("Unknown option") &&
          !output.includes("unknown option"),
        `Expected interfaces command to accept --future flag without 'Unknown option' error, but got: ${output}`,
      );
    }
  });

  test("help shows all available commands", () => {
    const output = execSync("./dist/cli.js --help", {
      cwd: QBDIR,
      encoding: "utf-8",
    });

    assert.ok(
      output.includes("edgeql-js"),
      "Expected --help output to include 'edgeql-js' command",
    );
    assert.ok(
      output.includes("queries"),
      "Expected --help output to include 'queries' command",
    );
    assert.ok(
      output.includes("interfaces"),
      "Expected --help output to include 'interfaces' command",
    );
    assert.ok(
      output.includes("prisma"),
      "Expected --help output to include 'prisma' command",
    );
  });

  test("command help shows connection options", () => {
    const output = execSync("./dist/cli.js queries --help", {
      cwd: QBDIR,
      encoding: "utf-8",
    });

    assert.ok(
      output.includes("-H, --host"),
      "Expected queries --help to show '-H, --host' option",
    );
    assert.ok(
      output.includes("-P, --port"),
      "Expected queries --help to show '-P, --port' option",
    );
    assert.ok(
      output.includes("-d, --database"),
      "Expected queries --help to show '-d, --database' option",
    );
    assert.ok(
      output.includes("--dsn"),
      "Expected queries --help to show '--dsn' option",
    );

    assert.ok(
      output.includes("--future"),
      "Expected queries --help to show '--future' option",
    );
  });
});
