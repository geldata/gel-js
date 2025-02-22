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

import * as gel from "../src/index.node";
import { resolveErrorCode } from "../src/errors/resolve";

test("resolve error", () => {
  expect(resolveErrorCode(0x04_02_01_01)).toBe(gel.InvalidLinkTargetError);
  expect(resolveErrorCode(0x04_02_01_ff)).toBe(gel.InvalidTargetError);
  expect(resolveErrorCode(0x04_02_ff_ff)).toBe(gel.InvalidTypeError);
  expect(resolveErrorCode(0x04_ff_ff_ff)).toBe(gel.QueryError);
  expect(resolveErrorCode(0xfe_ff_ff_ff)).toBe(gel.GelError);
});

test("message is set with attrs and query", () => {
  const error = new gel.AccessError("test");
  const attrs = new Map<number, Uint8Array>();

  const columnStart = 2;
  const columnEnd = 5;
  const lineNum = 1;
  const columnCount = columnEnd - columnStart;

  // lineStart
  attrs.set(-13, new Uint8Array(Buffer.from(String(lineNum), "utf-8")));
  // lineEnd
  attrs.set(-10, new Uint8Array(Buffer.from(String(lineNum), "utf-8")));
  // utf16ColumnStart
  attrs.set(-11, new Uint8Array(Buffer.from(String(columnStart), "utf-8")));
  // utf16ColumnEnd
  attrs.set(-8, new Uint8Array(Buffer.from(String(columnEnd), "utf-8")));

  (error as any)._attrs = attrs;
  (error as any)._query = "0123456789\n";
  expect(error.message).toContain("test");
  expect(error.message).toContain(String(lineNum));
  expect(error.message).toContain("^".repeat(columnCount));
});

test("message is set with attrs and query without position", () => {
  const error = new gel.AccessError("test");
  const attrs = new Map<number, Uint8Array>();

  // hint
  attrs.set(1, new Uint8Array(Buffer.from(String("hint text"), "utf-8")));
  // details
  attrs.set(2, new Uint8Array(Buffer.from(String("details text"), "utf-8")));

  (error as any)._attrs = attrs;
  (error as any)._query = "0123456789\n";
  expect(error.message).toContain("test");
  expect(error.message).toContain(String("hint text"));
  expect(error.message).toContain(String("details text"));
  expect(error.message).toBe("test\nDetails: details text\nHint: hint text\n");
});
