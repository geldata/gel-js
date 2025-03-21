/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2019-present MagicStack Inc. and the Gel authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fileURLToPath, URL } from "url";
import fs from "node:fs";
import path from "node:path";
import getStdin from "get-stdin";
import prettier from "prettier";

class Buffer {
  constructor() {
    this.buf = [];
  }

  nl() {
    this.buf.push("");
  }

  code(c) {
    this.buf.push(c);
  }

  render() {
    return this.buf.join("\n");
  }
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = new URL("", import.meta.url).pathname;

(async () => {
  const prettierOptions = (await prettier.resolveConfig(__dirname)) ?? {};
  prettierOptions.parser = "typescript";

  const json = await getStdin();
  const errors = JSON.parse(json);

  const src = fs.readFileSync(__filename);
  const copy = src.toString().match(/\/\*\!(?:.|\n|\r)*?\*\//g)[0];

  const errorsBuf = new Buffer();
  errorsBuf.code("/* AUTOGENERATED */");
  errorsBuf.nl();
  errorsBuf.code(copy);
  errorsBuf.nl();
  errorsBuf.code("/* tslint:disable */");
  errorsBuf.nl();
  errorsBuf.code("import {GelError} from './base'");
  errorsBuf.code("import * as tags from './tags'");
  errorsBuf.code("export {GelError} from './base'");
  errorsBuf.code("export * from './tags'");
  errorsBuf.nl();

  const mappingBuf = new Buffer();
  mappingBuf.code("/* AUTOGENERATED */");
  mappingBuf.nl();
  mappingBuf.code(copy);
  mappingBuf.nl();
  mappingBuf.code('import type { ErrorType } from "./base";');
  mappingBuf.code('import * as errors from "./index";');
  mappingBuf.nl();
  mappingBuf.nl();
  mappingBuf.code("export const errorMapping = new Map<number, ErrorType>();");
  mappingBuf.nl();

  for (let [err, base, c1, c2, c3, c4, tags] of errors) {
    const code =
      "0x" +
      c1.toString(16).padStart(2, "0") +
      "_" +
      c2.toString(16).padStart(2, "0") +
      "_" +
      c3.toString(16).padStart(2, "0") +
      "_" +
      c4.toString(16).padStart(2, "0");

    if (!base) {
      base = "GelError";
    }

    let tag_items = tags.map((t) => "[tags." + t + "]: true");
    let line = `export class ${err} extends ${base} `;
    line += `{\n`;
    if (tag_items.length > 0) {
      line += `  override protected static tags = {${tag_items.join(", ")}}\n`;
    }
    if (base !== "GelError") {
      line += `  override get code(): number {\n    return ${code};\n  }\n`;
    } else {
      line += `  get code(): number {\n    return ${code};\n  }\n`;
    }
    line += `}`;

    errorsBuf.code(line);
    errorsBuf.nl();

    mappingBuf.code(`errorMapping.set(${code}, errors.${err});`);
  }

  errorsBuf.nl();

  const errors_ts = prettier.format(errorsBuf.render(), prettierOptions);
  const mapping_ts = prettier.format(mappingBuf.render(), prettierOptions);

  fs.writeFileSync(
    path.join(__dirname, "./src/errors/index.ts"),
    await errors_ts,
  );
  fs.writeFileSync(
    path.join(__dirname, "./src/errors/map.ts"),
    await mapping_ts,
  );
})();
