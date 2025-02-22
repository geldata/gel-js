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

export class BytesCodec extends ScalarCodec implements ICodec {
  override tsType = "Uint8Array";

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    const val = ctx.preEncode<Codecs.BytesCodec>(this, object);
    if (!(val instanceof Uint8Array)) {
      throw new InvalidArgumentError(
        `a Uint8Array or Buffer was expected, got "${val}"`,
      );
    }

    buf.writeInt32(val.length);
    buf.writeBuffer(val);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.BytesCodec>(this, buf.consumeAsBuffer());
  }
}
