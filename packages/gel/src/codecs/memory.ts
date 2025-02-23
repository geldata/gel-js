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
import { type ICodec, ScalarCodec } from "./ifaces";
import { ConfigMemory } from "../datatypes/memory";
import { InvalidArgumentError } from "../errors";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";

export class ConfigMemoryCodec extends ScalarCodec implements ICodec {
  override tsType = "ConfigMemory";
  override tsModule = "gel";

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (ctx.hasOverload(this)) {
      const val = ctx.preEncode<Codecs.MemoryCodec>(this, object);
      if (typeof val != "bigint") {
        throw new InvalidArgumentError(
          `a bigint was expected out of a custom cfg::memory codec`,
        );
      }
      buf.writeInt32(8);
      buf.writeBigInt64(val);
      return;
    }

    if (!(object instanceof ConfigMemory)) {
      throw new InvalidArgumentError(
        `a ConfigMemory instance was expected, got "${object}"`,
      );
    }
    buf.writeInt32(8);
    // @ts-expect-error _bytes is private
    buf.writeBigInt64(object._bytes);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const val = buf.readBigInt64();

    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.MemoryCodec>(this, val);
    }

    return new ConfigMemory(val);
  }
}
