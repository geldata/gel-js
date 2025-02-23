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

import type { ReadBuffer, WriteBuffer } from "../primitives/buffer";
import { uuidToBuffer } from "../primitives/buffer";
import { type ICodec, ScalarCodec } from "./ifaces";
import { InvalidArgumentError } from "../errors";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";

function UUIDBufferFromString(uuid: string): Uint8Array {
  let uuidClean = uuid;
  if (uuidClean.length !== 32) {
    uuidClean = uuidClean.replace(/-/g, "");
    if (uuidClean.length !== 32) {
      throw new TypeError(`invalid UUID "${uuid}"`);
    }
  }
  try {
    return uuidToBuffer(uuidClean);
  } catch {
    throw new TypeError(`invalid UUID "${uuid}"`);
  }
}

export class UUIDCodec extends ScalarCodec implements ICodec {
  override tsType = "string";

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (ctx.hasOverload(this)) {
      const val = ctx.preEncode<Codecs.UUIDCodec>(this, object);
      if (!(val instanceof Uint8Array)) {
        throw new InvalidArgumentError(
          `a Uint8Array was expected from a custom UUID codec`,
        );
      }
      if (val.length != 16) {
        throw new InvalidArgumentError(
          `a 16-element long Uint8Array was expected from a custom UUID codec`,
        );
      }
      buf.writeInt32(16);
      buf.writeBuffer(val);
      return;
    }

    if (typeof object === "string") {
      const ubuf = UUIDBufferFromString(object);
      buf.writeInt32(16);
      buf.writeBuffer(ubuf);
    } else {
      throw new InvalidArgumentError(
        `cannot encode UUID "${object}": invalid type`,
      );
    }
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.UUIDCodec>(this, buf.readUUIDBytes());
    }

    return buf.readUUID("-");
  }
}
