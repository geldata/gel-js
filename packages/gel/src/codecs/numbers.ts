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

export class Int64Codec extends ScalarCodec implements ICodec {
  override tsType = "number";
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (ctx.hasOverload(this)) {
      const val = ctx.preEncode<Codecs.Int64Codec>(this, object);
      buf.writeInt32(8);
      buf.writeBigInt64(val);
      return;
    }

    if (typeof object !== "number") {
      throw new InvalidArgumentError(`a number was expected, got "${object}"`);
    }

    buf.writeInt32(8);
    buf.writeInt64(object);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.Int64Codec>(this, buf.readBigInt64());
    }

    return buf.readInt64();
  }
}

export class Int32Codec extends ScalarCodec implements ICodec {
  override tsType = "number";
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    object = ctx.preEncode<Codecs.Int32Codec>(this, object);
    if (typeof object !== "number") {
      throw new InvalidArgumentError(`a number was expected, got "${object}"`);
    }
    buf.writeInt32(4);
    buf.writeInt32(object as number);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.Int32Codec>(this, buf.readInt32());
  }
}

export class Int16Codec extends ScalarCodec implements ICodec {
  override tsType = "number";
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    object = ctx.preEncode<Codecs.Int16Codec>(this, object);
    if (typeof object !== "number") {
      throw new InvalidArgumentError(`a number was expected, got "${object}"`);
    }
    buf.writeInt32(2);
    buf.writeInt16(object as number);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.Int16Codec>(this, buf.readInt16());
  }
}

export class Float32Codec extends ScalarCodec implements ICodec {
  override tsType = "number";
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    object = ctx.preEncode<Codecs.Float32Codec>(this, object);
    if (typeof object !== "number") {
      throw new InvalidArgumentError(`a number was expected, got "${object}"`);
    }
    buf.writeInt32(4);
    buf.writeFloat32(object as number);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.Float32Codec>(this, buf.readFloat32());
  }
}

export class Float64Codec extends ScalarCodec implements ICodec {
  override tsType = "number";
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    object = ctx.preEncode<Codecs.Float64Codec>(this, object);
    if (typeof object !== "number") {
      throw new InvalidArgumentError(`a number was expected, got "${object}"`);
    }
    buf.writeInt32(8);
    buf.writeFloat64(object as number);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    return ctx.postDecode<Codecs.Float64Codec>(this, buf.readFloat64());
  }
}
