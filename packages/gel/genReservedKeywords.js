const fs = require("fs/promises");
const path = require("path");
const util = require("util");
const execFile = util.promisify(require("child_process").execFile);

const prettier = require("prettier");

(async () => {
  const { stdout: grammar } = await execFile("edb", [
    "gen-meta-grammars",
    "edgeql",
  ]);

  const [_, resKeywords] =
    grammar.match(/reserved_keywords = \((.*?)\)/s) ?? [];

  const reservedKeywords = resKeywords
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").slice(1, -1))
    .filter((keyword) => !!keyword);

  await fs.writeFile(
    path.join(__dirname, "../src/reflection/reservedKeywords.ts"),
    prettier.format(
      `export const reservedKeywords = new Set(${JSON.stringify(
        reservedKeywords,
        null,
        2
      )})\n`
    )
  );
})();
