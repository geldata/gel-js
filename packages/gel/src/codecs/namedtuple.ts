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
import { ReadBuffer, WriteBuffer } from "../primitives/buffer";
import {
  InvalidArgumentError,
  MissingArgumentError,
  ProtocolError,
  QueryArgumentError,
} from "../errors";
import type { CodecContext } from "./context";

export class NamedTupleCodec extends Codec implements ICodec {
  private subCodecs: ICodec[];
  private names: string[];
  public typeName: string;

  constructor(tid: uuid, typeName: string, codecs: ICodec[], names: string[]) {
    super(tid);
    this.subCodecs = codecs;
    this.names = names;
    this.typeName = typeName;
  }

  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (typeof object !== "object" || Array.isArray(object)) {
      throw new InvalidArgumentError(`an object was expected, got "${object}"`);
    }

    const codecsLen = this.subCodecs.length;

    if (Object.keys(object).length !== codecsLen) {
      throw new QueryArgumentError(
        `expected ${codecsLen} element${
          codecsLen === 1 ? "" : "s"
        } in named tuple, got ${Object.keys(object).length}`,
      );
    }

    const elemData = new WriteBuffer();
    for (let i = 0; i < codecsLen; i++) {
      const key = this.names[i];
      const val = object[key];

      if (val == null) {
        throw new MissingArgumentError(
          `element '${key}' in named tuple cannot be 'null'`,
        );
      } else {
        elemData.writeInt32(0); // reserved
        try {
          this.subCodecs[i].encode(elemData, val, ctx);
        } catch (e) {
          if (e instanceof QueryArgumentError) {
            throw new InvalidArgumentError(
              `invalid element '${key}' in named tuple: ${e.message}`,
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
        `cannot decode NamedTuple: expected ` +
          `${subCodecs.length} elements, got ${els}`,
      );
    }

    const elemBuf = ReadBuffer.alloc();
    const names = this.names;
    const result: any = {};
    for (let i = 0; i < els; i++) {
      buf.discard(4); // reserved
      const elemLen = buf.readInt32();
      let val = null;
      if (elemLen !== -1) {
        buf.sliceInto(elemBuf, elemLen);
        val = subCodecs[i].decode(elemBuf, ctx);
        elemBuf.finish();
      }
      result[names[i]] = val;
    }

    return result;
  }

  getSubcodecs(): ICodec[] {
    return Array.from(this.subCodecs);
  }

  getNames(): string[] {
    return Array.from(this.names);
  }

  getKind(): CodecKind {
    return "namedtuple";
  }
}
