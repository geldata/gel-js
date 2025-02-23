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
import { Codec } from "./ifaces";
import { type WriteBuffer, ReadBuffer } from "../primitives/buffer";
import { ArrayCodec } from "./array";
import { InvalidArgumentError, ProtocolError } from "../errors";
import type { CodecContext } from "./context";

export class SetCodec extends Codec implements ICodec {
  private subCodec: ICodec;

  constructor(tid: uuid, subCodec: ICodec) {
    super(tid);
    this.subCodec = subCodec;
  }

  encode(_buf: WriteBuffer, _obj: any): void {
    throw new InvalidArgumentError("Sets cannot be passed in query arguments");
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    if (this.subCodec instanceof ArrayCodec) {
      return this.decodeSetOfArrays(buf, ctx);
    } else {
      return this.decodeSet(buf, ctx);
    }
  }

  private decodeSetOfArrays(buf: ReadBuffer, ctx: CodecContext): any {
    const ndims = buf.readInt32();

    buf.discard(4); // ignore flags
    buf.discard(4); // reserved

    if (ndims === 0) {
      return [];
    }
    if (ndims !== 1) {
      throw new ProtocolError(
        `expected 1-dimensional array of records of arrays`,
      );
    }

    const len = buf.readUInt32();

    buf.discard(4); // ignore the lower bound info

    const result = new Array(len);
    const elemBuf = ReadBuffer.alloc();
    const subCodec = this.subCodec;

    for (let i = 0; i < len; i++) {
      buf.discard(4); // ignore array element size

      const recSize = buf.readUInt32();
      if (recSize !== 1) {
        throw new ProtocolError(
          "expected a record with a single element as an array set " +
            "element envelope",
        );
      }

      buf.discard(4); // reserved

      const elemLen = buf.readInt32();
      if (elemLen === -1) {
        throw new ProtocolError("unexpected NULL value in array set element");
      }

      buf.sliceInto(elemBuf, elemLen);
      result[i] = subCodec.decode(elemBuf, ctx);
      elemBuf.finish();
    }

    return result;
  }

  private decodeSet(buf: ReadBuffer, ctx: CodecContext): any {
    const ndims = buf.readInt32();

    buf.discard(4); // ignore flags
    buf.discard(4); // reserved

    if (ndims === 0) {
      return [];
    }
    if (ndims !== 1) {
      throw new ProtocolError(`invalid set dimensinality: ${ndims}`);
    }

    const len = buf.readUInt32();

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
    return "set";
  }
}
