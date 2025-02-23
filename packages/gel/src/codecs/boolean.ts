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
import { InvalidArgumentError } from "../errors";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";

export class BoolCodec extends ScalarCodec implements ICodec {
  override tsType = "boolean";

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    const val = ctx.preEncode<Codecs.BoolCodec>(this, object);
    const typeOf = typeof val;
    if (typeOf !== "boolean" && typeOf !== "number") {
      throw new InvalidArgumentError(
        `a boolean or a number was expected, got "${val}"`,
      );
    }
    buf.writeInt32(1);
    buf.writeChar(val ? 1 : 0);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.BoolCodec>(this, buf.readUInt8() !== 0);
  }
}
