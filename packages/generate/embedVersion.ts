import path from "path";
import { readFileSync, writeFileSync } from "fs";

const packageVersion = JSON.parse(
  readFileSync(path.join(__dirname, "package.json"), "utf8"),
).version;

for (const filepath of process.argv.slice(2)) {
  writeFileSync(
    filepath,
    readFileSync(filepath, "utf8").replace(
      "__@gel/generate__VERSION_PLACEHOLDER__",
      packageVersion,
    ),
  );
}
