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

import { KNOWN_TYPENAMES } from "./consts";

import type { ICodec, uuid, CodecKind } from "./ifaces";
import { Codec } from "./ifaces";
import { ReadBuffer, WriteBuffer } from "../primitives/buffer";
import {
  InvalidArgumentError,
  MissingArgumentError,
  ProtocolError,
  QueryArgumentError,
} from "../errors";
import type { CodecContext } from "./context";

export class TupleCodec extends Codec implements ICodec {
  private subCodecs: ICodec[];
  public typeName: string | null;

  constructor(tid: uuid, typeName: string | null, codecs: ICodec[]) {
    super(tid);
    this.subCodecs = codecs;
    this.typeName = typeName;
  }

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (!Array.isArray(object)) {
      throw new InvalidArgumentError(`an array was expected, got "${object}"`);
    }

    const codecs = this.subCodecs;
    const codecsLen = codecs.length;

    if (object.length !== codecsLen) {
      throw new InvalidArgumentError(
        `expected ${codecsLen} tuple item${codecsLen === 1 ? "" : "s"}, got ${
          object.length
        }`,
      );
    }

    if (!codecsLen) {
      buf.writeBuffer(EmptyTupleCodec.BUFFER);
    }

    const elemData = new WriteBuffer();
    for (let i = 0; i < codecsLen; i++) {
      const elem = object[i];
      elemData.writeInt32(0); // reserved bytes
      if (elem == null) {
        throw new MissingArgumentError(
          `element at index ${i} in tuple cannot be 'null'`,
        );
      } else {
        try {
          codecs[i].encode(elemData, elem, ctx);
        } catch (e) {
          if (e instanceof QueryArgumentError) {
            throw new InvalidArgumentError(
              `invalid element at index ${i} in tuple: ${e.message}`,
            );
          } else {
            throw e;
          }
        }
      }
    }

    const elemBuf = elemData.unwrap();

    buf.writeInt32(4 + elemBuf.length);
    buf.writeInt32(codecsLen);
    buf.writeBuffer(elemBuf);
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const els = buf.readUInt32();
    const subCodecs = this.subCodecs;
    if (els !== subCodecs.length) {
      throw new ProtocolError(
        `cannot decode Tuple: expected ` +
          `${subCodecs.length} elements, got ${els}`,
      );
    }

    const elemBuf = ReadBuffer.alloc();
    const result = new Array(els);
    for (let i = 0; i < els; i++) {
      buf.discard(4); // reserved
      const elemLen = buf.readInt32();
      if (elemLen === -1) {
        result[i] = null;
      } else {
        buf.sliceInto(elemBuf, elemLen);
        result[i] = subCodecs[i].decode(elemBuf, ctx);
        elemBuf.finish();
      }
    }

    return result;
  }

  getSubcodecs(): ICodec[] {
    return Array.from(this.subCodecs);
  }

  getKind(): CodecKind {
    return "tuple";
  }
}

export class EmptyTupleCodec extends Codec implements ICodec {
  static BUFFER: Uint8Array = new WriteBuffer()
    .writeInt32(4)
    .writeInt32(0)
    .unwrap();

  encode(buf: WriteBuffer, object: any, _ctx: CodecContext): void {
    if (!Array.isArray(object)) {
      throw new InvalidArgumentError(
        "cannot encode empty Tuple: expected an array",
      );
    }
    if (object.length) {
      throw new InvalidArgumentError(
        `cannot encode empty Tuple: expected 0 elements got ${object.length}`,
      );
    }
    buf.writeInt32(4);
    buf.writeInt32(0);
  }

  decode(buf: ReadBuffer): any {
    const els = buf.readInt32();
    if (els !== 0) {
      throw new ProtocolError(
        `cannot decode empty Tuple: expected 0 elements, received ${els}`,
      );
    }
    return [];
  }

  getSubcodecs(): ICodec[] {
    return [];
  }

  getKind(): CodecKind {
    return "tuple";
  }
}

export const EMPTY_TUPLE_CODEC_ID = KNOWN_TYPENAMES.get("empty-tuple")!;
export const EMPTY_TUPLE_CODEC = new EmptyTupleCodec(EMPTY_TUPLE_CODEC_ID);
