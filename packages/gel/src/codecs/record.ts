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
import type { Codecs } from "./codecs";
import type { WriteBuffer } from "../primitives/buffer";
import { ReadBuffer } from "../primitives/buffer";
import {
  InternalClientError,
  InvalidArgumentError,
  ProtocolError,
} from "../errors";
import type { CodecContext } from "./context";

const SQLRowArrayCodec: Codecs.SQLRowCodec = {
  fromDatabase(values: any[], _desc: { names: string[] }): any[] {
    return values;
  },
  toDatabase() {
    throw new InternalClientError(
      "cannot encode SQL record as a query argument",
    );
  },
};

const SQLRowObjectCodec: Codecs.SQLRowCodec = {
  fromDatabase(values: any[], { names }: { names: string[] }): any {
    return Object.fromEntries(names.map((key, index) => [key, values[index]]));
  },
  toDatabase() {
    throw new InternalClientError(
      "cannot encode SQL record as a query argument",
    );
  },
};

export const SQLRowModeArray = {
  _private_sql_row: SQLRowArrayCodec,
};

export const SQLRowModeObject = {
  _private_sql_row: SQLRowObjectCodec,
};

export class RecordCodec extends Codec implements ICodec {
  private subCodecs: ICodec[];
  private names: string[];

  constructor(tid: uuid, codecs: ICodec[], names: string[]) {
    super(tid);
    this.subCodecs = codecs;
    this.names = names;
  }

  encode(_buf: WriteBuffer, _object: any): void {
    throw new InvalidArgumentError("SQL records cannot be passed as arguments");
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const els = buf.readUInt32();
    const subCodecs = this.subCodecs;
    if (els !== subCodecs.length) {
      throw new ProtocolError(
        `cannot decode Record: expected ` +
          `${subCodecs.length} elements, got ${els}`,
      );
    }

    const elemBuf = ReadBuffer.alloc();
    const overload = ctx.getContainerOverload("_private_sql_row");

    if (overload != null && overload !== SQLRowObjectCodec) {
      const result: any[] = new Array(els);
      for (let i = 0; i < els; i++) {
        buf.discard(4); // reserved
        const elemLen = buf.readInt32();
        let val = null;
        if (elemLen !== -1) {
          buf.sliceInto(elemBuf, elemLen);
          val = subCodecs[i].decode(elemBuf, ctx);
          elemBuf.finish();
        }
        result[i] = val;
      }

      if (overload !== SQLRowArrayCodec) {
        return overload.fromDatabase(result, { names: this.names });
      }

      return result;
    } else {
      // Parsing code is basically duplicated to make things fast.
      const names = this.names;
      const result: Record<string, any> = {};
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
  }

  getSubcodecs(): ICodec[] {
    return Array.from(this.subCodecs);
  }

  getNames(): string[] {
    return Array.from(this.names);
  }

  getKind(): CodecKind {
    return "record";
  }
}
