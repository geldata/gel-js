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

import {
  BufferError,
  WriteMessageBuffer,
  encodeB64,
} from "../src/primitives/buffer";
import * as chars from "../src/primitives/chars";

test("matches gel-python packing", () => {
  const w: WriteMessageBuffer = new WriteMessageBuffer();

  w.beginMessage(chars.$E)
    .writeUInt16(10)
    .writeString("aaaaaa")
    .endMessage()
    .beginMessage(chars.$P)
    .writeUInt32(1000001)
    .writeString("bbbbbbbbb")
    .endMessage();

  const buf = w.unwrap();
  expect(encodeB64(buf)).toBe(
    "RQAAABAACgAAAAZhYWFhYWFQAAAAFQAPQkEAAAAJYmJiYmJiYmJi",
  );
});

test("maintains internal messages integrity", () => {
  const w: WriteMessageBuffer = new WriteMessageBuffer();

  expect(() => {
    w.writeInt16(10);
  }).toThrowError(BufferError);

  expect(() => {
    w.writeString("SELECT ...");
  }).toThrowError(BufferError);

  expect(() => {
    w.endMessage();
  }).toThrowError(BufferError);

  w.beginMessage(chars.$E);

  expect(() => {
    w.beginMessage(chars.$P);
  }).toThrowError(BufferError);

  expect(() => {
    w.unwrap();
  }).toThrowError(BufferError);
});
