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
  type ReadBuffer,
  type WriteBuffer,
  utf8Encoder,
} from "../primitives/buffer";
import { type ICodec, ScalarCodec } from "./ifaces";
import { InvalidArgumentError, ProtocolError } from "../errors";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";

export class JSONCodec extends ScalarCodec implements ICodec {
  override tsType = "unknown";

  readonly jsonFormat: number | null = 1;

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    let val: string;
    if (ctx.hasOverload(this)) {
      val = ctx.preEncode<Codecs.JsonCodec>(this, object);
    } else {
      try {
        val = JSON.stringify(object);
      } catch (_err) {
        throw new InvalidArgumentError(
          `a JSON-serializable value was expected, got "${object}"`,
        );
      }
    }

    // JSON.stringify can return undefined
    if (typeof val !== "string") {
      throw new InvalidArgumentError(
        `a JSON-serializable value was expected, got "${object}"`,
      );
    }

    const strbuf = utf8Encoder.encode(val);
    if (this.jsonFormat !== null) {
      buf.writeInt32(strbuf.length + 1);
      buf.writeChar(this.jsonFormat);
    } else {
      buf.writeInt32(strbuf.length);
    }
    buf.writeBuffer(strbuf);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    if (this.jsonFormat !== null) {
      const format = buf.readUInt8();
      if (format !== this.jsonFormat) {
        throw new ProtocolError(`unexpected JSON format ${format}`);
      }
    }
    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.JsonCodec>(this, buf.consumeAsString());
    } else {
      return JSON.parse(buf.consumeAsString());
    }
  }
}

export class PgTextJSONCodec extends JSONCodec {
  override readonly jsonFormat = null;
}

export class PgTextJSONStringCodec extends ScalarCodec implements ICodec {
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (ctx.hasOverload(this)) {
      object = ctx.preEncode<Codecs.JsonCodec>(this, object);
    }

    if (typeof object !== "string") {
      throw new InvalidArgumentError(`a string was expected, got "${object}"`);
    }

    const strbuf = utf8Encoder.encode(object);
    buf.writeInt32(strbuf.length);
    buf.writeBuffer(strbuf);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.JsonCodec>(this, buf.consumeAsString());
  }
}
