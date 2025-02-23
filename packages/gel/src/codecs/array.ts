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

import type { ICodec, uuid, CodecKind } from "./ifaces";
import { Codec, ScalarCodec } from "./ifaces";
import { WriteBuffer, ReadBuffer } from "../primitives/buffer";
import { TupleCodec } from "./tuple";
import { MultiRangeCodec, RangeCodec } from "./range";
import { InvalidArgumentError, ProtocolError } from "../errors";
import { NamedTupleCodec } from "./namedtuple";
import type { CodecContext } from "./context";

export class ArrayCodec extends Codec implements ICodec {
  private subCodec: ICodec;
  private len: number;
  public typeName: string;

  constructor(tid: uuid, typeName: string, subCodec: ICodec, len: number) {
    super(tid);
    this.subCodec = subCodec;
    this.len = len;
    this.typeName = typeName;
  }

  encode(buf: WriteBuffer, obj: any, ctx: CodecContext): void {
    if (
      !(
        this.subCodec instanceof ScalarCodec ||
        this.subCodec instanceof TupleCodec ||
        this.subCodec instanceof NamedTupleCodec ||
        this.subCodec instanceof RangeCodec ||
        this.subCodec instanceof MultiRangeCodec
      )
    ) {
      throw new InvalidArgumentError(
        "only arrays of scalars or tuples are supported",
      );
    }

    if (!Array.isArray(obj) && !isTypedArray(obj)) {
      throw new InvalidArgumentError(
        `an array was expected (got type ${obj.constructor.name})`,
      );
    }

    const subCodec = this.subCodec;
    const elemData = new WriteBuffer();
    const objLen = obj.length;

    if (objLen > 0x7fffffff) {
      // objLen > MAXINT32
      throw new InvalidArgumentError("too many elements in array");
    }

    for (let i = 0; i < objLen; i++) {
      const item = obj[i];
      if (item == null) {
        elemData.writeInt32(-1);
      } else {
        subCodec.encode(elemData, item, ctx);
      }
    }
    const elemBuf = elemData.unwrap();

    buf.writeInt32(12 + 8 + elemBuf.length);
    buf.writeInt32(1); // number of dimensions
    buf.writeInt32(0); // flags
    buf.writeInt32(0); // reserved

    buf.writeInt32(objLen);
    buf.writeInt32(1);

    buf.writeBuffer(elemBuf);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const ndims = buf.readInt32();

    buf.discard(4); // ignore flags
    buf.discard(4); // reserved

    if (ndims === 0) {
      return [];
    }
    if (ndims !== 1) {
      throw new ProtocolError("only 1-dimensional arrays are supported");
    }

    const len = buf.readUInt32();
    if (this.len !== -1 && len !== this.len) {
      throw new ProtocolError(
        `invalid array size: received ${len}, expected ${this.len}`,
      );
    }

    buf.discard(4); // ignore the lower bound info

    const result = new Array(len);
    const elemBuf = ReadBuffer.alloc();
    const subCodec = this.subCodec;

    for (let i = 0; i < len; i++) {
      const elemLen = buf.readInt32();
      if (elemLen === -1) {
        result[i] = null;
      } else {
        buf.sliceInto(elemBuf, elemLen);
        result[i] = subCodec.decode(elemBuf, ctx);
        elemBuf.finish();
      }
    }

    return result;
  }

  getSubcodecs(): ICodec[] {
    return [this.subCodec];
  }

  getKind(): CodecKind {
    return "array";
  }
}

function isTypedArray(obj: any): obj is any[] {
  return !!(obj.buffer instanceof ArrayBuffer && obj.BYTES_PER_ELEMENT);
}
