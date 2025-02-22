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

import { ReadBuffer } from "../primitives/buffer";
import LRU from "../primitives/lru";
import { type ICodec, type uuid, ScalarCodec } from "./ifaces";
import { NULL_CODEC, SCALAR_CODECS } from "./codecs";
import { NULL_CODEC_ID, KNOWN_TYPES } from "./consts";
import { EMPTY_TUPLE_CODEC, EMPTY_TUPLE_CODEC_ID, TupleCodec } from "./tuple";
import { ArrayCodec } from "./array";
import { NamedTupleCodec } from "./namedtuple";
import { EnumCodec } from "./enum";
import { ObjectCodec } from "./object";
import { SetCodec } from "./set";
import { RecordCodec } from "./record";
import { MultiRangeCodec, RangeCodec } from "./range";
import type { ProtocolVersion } from "../ifaces";
import { versionGreaterThanOrEqual } from "../utils";
import { SparseObjectCodec } from "./sparseObject";
import {
  ProtocolError,
  InternalClientError,
  UnsupportedProtocolVersionError,
} from "../errors";

const CODECS_CACHE_SIZE = 1000;
const CODECS_BUILD_CACHE_SIZE = 200;

const CTYPE_SET = 0;
const CTYPE_SHAPE = 1;
const CTYPE_BASE_SCALAR = 2;
const CTYPE_SCALAR = 3;
const CTYPE_TUPLE = 4;
const CTYPE_NAMEDTUPLE = 5;
const CTYPE_ARRAY = 6;
const CTYPE_ENUM = 7;
const CTYPE_INPUT_SHAPE = 8;
const CTYPE_RANGE = 9;
const CTYPE_OBJECT = 10;
const CTYPE_COMPOUND = 11;
const CTYPE_MULTIRANGE = 12;
const CTYPE_RECORD = 13;

export class CodecsRegistry {
  private codecsBuildCache: LRU<uuid, ICodec>;
  private codecs: LRU<uuid, ICodec>;

  constructor() {
    this.codecs = new LRU({ capacity: CODECS_CACHE_SIZE });
    this.codecsBuildCache = new LRU({ capacity: CODECS_BUILD_CACHE_SIZE });
  }

  hasCodec(typeId: uuid): boolean {
    if (this.codecs.has(typeId)) {
      return true;
    }

    return typeId === NULL_CODEC_ID || typeId === EMPTY_TUPLE_CODEC_ID;
  }

  getCodec(typeId: uuid): ICodec | null {
    const codec = this.codecs.get(typeId);
    if (codec != null) {
      return codec;
    }

    if (typeId === EMPTY_TUPLE_CODEC_ID) {
      return EMPTY_TUPLE_CODEC;
    }

    if (typeId === NULL_CODEC_ID) {
      return NULL_CODEC;
    }

    return null;
  }

  buildCodec(spec: Uint8Array, protocolVersion: ProtocolVersion): ICodec {
    if (!versionGreaterThanOrEqual(protocolVersion, [2, 0])) {
      throw new UnsupportedProtocolVersionError(
        "unsupported old protocol version v1; downgrade to the previous " +
          "version of gel-js",
      );
    }

    const frb = new ReadBuffer(spec);
    const codecsList: ICodec[] = [];
    let codec: ICodec | null = null;

    while (frb.length) {
      const descLen = frb.readInt32();
      const descBuf = ReadBuffer.alloc();
      frb.sliceInto(descBuf, descLen);
      codec = this._buildCodec(descBuf, codecsList);
      descBuf.finish("unexpected trailing data in type descriptor buffer");

      if (codec == null) {
        // An annotation; ignore.
        continue;
      }

      codecsList.push(codec);
      this.codecs.set(codec.tid, codec);
    }

    if (!codecsList.length) {
      throw new InternalClientError("could not build a codec");
    }

    return codecsList[codecsList.length - 1];
  }

  private _buildCodec(frb: ReadBuffer, cl: ICodec[]): ICodec | null {
    const t = frb.readUInt8();
    const tid = frb.readUUID();

    let res = this.codecs.get(tid);
    if (res == null) {
      res = this.codecsBuildCache.get(tid);
    }

    if (res != null) {
      // We have a codec for this "tid"; advance the buffer
      // so that we can process the next codec.
      frb.discard(frb.length);
      return res;
    }

    switch (t) {
      case CTYPE_BASE_SCALAR: {
        res = SCALAR_CODECS.get(tid);
        if (!res) {
          if (KNOWN_TYPES.has(tid)) {
            throw new InternalClientError(
              `no JS codec for ${KNOWN_TYPES.get(tid)}`,
            );
          }

          throw new InternalClientError(
            `no JS codec for the type with ID ${tid}`,
          );
        }
        if (!(res instanceof ScalarCodec)) {
          throw new ProtocolError(
            "could not build scalar codec: base scalar is a non-scalar codec",
          );
        }
        break;
      }

      case CTYPE_SHAPE:
      case CTYPE_INPUT_SHAPE: {
        if (t === CTYPE_SHAPE) {
          // const _isEphemeralFreeShape =
          frb.readBoolean();
          // const _objTypePos =
          frb.readUInt16();
        }

        const els = frb.readUInt16();
        const codecs: ICodec[] = new Array(els);
        const names: string[] = new Array(els);
        const flags: number[] = new Array(els);
        const cards: number[] = new Array(els);

        for (let i = 0; i < els; i++) {
          const flag: number = frb.readUInt32();
          const card: number = frb.readUInt8();

          const name = frb.readString();

          const pos = frb.readUInt16();
          const subCodec = cl[pos];
          if (subCodec == null) {
            throw new ProtocolError(
              "could not build object codec: missing subcodec",
            );
          }

          codecs[i] = subCodec;
          names[i] = name;
          flags[i] = flag!;
          cards[i] = card!;

          if (t === CTYPE_SHAPE) {
            // const sourceTypePos =
            frb.readUInt16();
            // const _sourceType = cl[sourceTypePos];
          }
        }

        res =
          t === CTYPE_INPUT_SHAPE
            ? new SparseObjectCodec(tid, codecs, names)
            : new ObjectCodec(tid, codecs, names, flags, cards);
        break;
      }

      case CTYPE_SET: {
        const pos = frb.readUInt16();
        const subCodec = cl[pos];
        if (subCodec == null) {
          throw new ProtocolError(
            "could not build set codec: missing subcodec",
          );
        }
        res = new SetCodec(tid, subCodec);
        break;
      }

      case CTYPE_SCALAR: {
        const typeName = frb.readString();
        // const _isSchemaDefined =
        frb.readBoolean();

        const ancestorCount = frb.readUInt16();
        const ancestors: ScalarCodec[] = [];
        for (let i = 0; i < ancestorCount; i++) {
          const ancestorPos = frb.readUInt16();
          const ancestorCodec = cl[ancestorPos];
          if (ancestorCodec == null) {
            throw new ProtocolError(
              "could not build scalar codec: missing a codec for base scalar",
            );
          }

          if (!(ancestorCodec instanceof ScalarCodec)) {
            throw new ProtocolError(
              `a scalar codec expected for base scalar type, ` +
                `got ${ancestorCodec}`,
            );
          }
          ancestors.push(ancestorCodec);
        }

        if (ancestorCount === 0) {
          res = SCALAR_CODECS.get(tid);
          if (res == null) {
            if (KNOWN_TYPES.has(tid)) {
              throw new InternalClientError(
                `no JS codec for ${KNOWN_TYPES.get(tid)}`,
              );
            }

            throw new InternalClientError(
              `no JS codec for the type with ID ${tid}`,
            );
          }
        } else {
          const baseCodec = ancestors[ancestors.length - 1];
          res = baseCodec.derive(tid, typeName, ancestors) as ICodec;
        }

        break;
      }

      case CTYPE_ARRAY: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        const pos = frb.readUInt16();
        const els = frb.readUInt16();
        if (els !== 1) {
          throw new ProtocolError(
            "cannot handle arrays with more than one dimension",
          );
        }
        const dimLen = frb.readInt32();
        const subCodec = cl[pos];
        if (subCodec == null) {
          throw new ProtocolError(
            "could not build array codec: missing subcodec",
          );
        }
        res = new ArrayCodec(tid, typeName, subCodec, dimLen);
        break;
      }

      case CTYPE_TUPLE: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        const els = frb.readUInt16();
        if (els === 0) {
          res = EMPTY_TUPLE_CODEC;
        } else {
          const codecs = new Array(els);
          for (let i = 0; i < els; i++) {
            const pos = frb.readUInt16();
            const subCodec = cl[pos];
            if (subCodec == null) {
              throw new ProtocolError(
                "could not build tuple codec: missing subcodec",
              );
            }
            codecs[i] = subCodec;
          }
          res = new TupleCodec(tid, typeName, codecs);
        }
        break;
      }

      case CTYPE_NAMEDTUPLE: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        const els = frb.readUInt16();
        const codecs = new Array(els);
        const names = new Array(els);
        for (let i = 0; i < els; i++) {
          names[i] = frb.readString();

          const pos = frb.readUInt16();
          const subCodec = cl[pos];
          if (subCodec == null) {
            throw new ProtocolError(
              "could not build namedtuple codec: missing subcodec",
            );
          }
          codecs[i] = subCodec;
        }
        res = new NamedTupleCodec(tid, typeName, codecs, names);
        break;
      }

      case CTYPE_RECORD: {
        const els = frb.readUInt16();
        const codecs = new Array(els);
        const names = new Array(els);
        for (let i = 0; i < els; i++) {
          names[i] = frb.readString();
          const pos = frb.readUInt16();
          const subCodec = cl[pos];
          if (subCodec == null) {
            throw new ProtocolError(
              "could not build record codec: missing subcodec",
            );
          }
          codecs[i] = subCodec;
        }
        res = new RecordCodec(tid, codecs, names);
        break;
      }

      case CTYPE_ENUM: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        /* There's no way to customize ordering in JS, so we
           simply ignore that information and unpack enums into
           simple strings.
        */
        const els = frb.readUInt16();
        const values: string[] = [];
        for (let i = 0; i < els; i++) {
          values.push(frb.readString());
        }
        res = new EnumCodec(tid, typeName, values);
        break;
      }

      case CTYPE_RANGE: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        const pos = frb.readUInt16();
        const subCodec = cl[pos];
        if (subCodec == null) {
          throw new ProtocolError(
            "could not build range codec: missing subcodec",
          );
        }
        res = new RangeCodec(tid, typeName, subCodec);
        break;
      }

      case CTYPE_OBJECT: {
        // Ignore
        frb.discard(frb.length);
        res = NULL_CODEC;
        break;
      }

      case CTYPE_COMPOUND: {
        // Ignore
        frb.discard(frb.length);
        res = NULL_CODEC;
        break;
      }

      case CTYPE_MULTIRANGE: {
        const typeName: string = frb.readString();

        // const _isSchemaDefined =
        frb.readBoolean();
        const ancestorCount = frb.readUInt16();
        for (let i = 0; i < ancestorCount; i++) {
          // const ancestorPos =
          frb.readUInt16();
          // const _ancestorCodec = cl[ancestorPos];
        }

        const pos = frb.readUInt16();
        const subCodec = cl[pos];
        if (subCodec == null) {
          throw new ProtocolError(
            "could not build range codec: missing subcodec",
          );
        }
        res = new MultiRangeCodec(tid, typeName, subCodec);
        break;
      }
    }

    if (res == null) {
      if (KNOWN_TYPES.has(tid)) {
        throw new InternalClientError(
          `could not build a codec for ${KNOWN_TYPES.get(tid)} type`,
        );
      } else {
        throw new InternalClientError(
          `could not build a codec for ${tid} type`,
        );
      }
    }

    this.codecsBuildCache.set(tid, res);
    return res;
  }
}
