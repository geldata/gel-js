import assert from "node:assert/strict";
import path from "path";
import { systemUtils } from "gel";
import { execSync } from "child_process";

const QBDIR = path.resolve(__dirname, "..");

describe("cli", () => {
  test("basic generate", async () => {
    execSync(`yarn generate edgeql-js --force-overwrite`, {
      stdio: "inherit",
    });
    const qbIndex = path.resolve(QBDIR, "dbschema", "edgeql-js", "index.ts");
    assert.equal(await systemUtils.exists(qbIndex), true);
  }, 60000);
});
