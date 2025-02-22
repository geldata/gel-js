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
import { utf8Encoder } from "../primitives/buffer";
import { type ICodec, ScalarCodec } from "./ifaces";
import { InvalidArgumentError } from "../errors";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";

export class StrCodec extends ScalarCodec implements ICodec {
  override tsType = "string";

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    object = ctx.preEncode<Codecs.StrCodec>(this, object);

    if (typeof object !== "string") {
      throw new InvalidArgumentError(`a string was expected, got "${object}"`);
    }

    const val = object as string;
    const strbuf = utf8Encoder.encode(val);
    buf.writeInt32(strbuf.length);
    buf.writeBuffer(strbuf);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.StrCodec>(this, buf.consumeAsString());
  }
}
