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

import type { ReadBuffer } from "../primitives/buffer";
import { WriteBuffer } from "../primitives/buffer";
import { BoolCodec } from "./boolean";
import type { ScalarCodec } from "./ifaces";
import { type ICodec, type uuid, type CodecKind, Codec } from "./ifaces";
import {
  Int16Codec,
  Int32Codec,
  Int64Codec,
  Float32Codec,
  Float64Codec,
} from "./numbers";
import { BigIntCodec, DecimalStringCodec } from "./numerics";
import { StrCodec } from "./text";
import { UUIDCodec } from "./uuid";
import { BytesCodec } from "./bytes";
import { JSONCodec, PgTextJSONCodec } from "./json";
import {
  DateTimeCodec,
  LocalDateCodec,
  LocalDateTimeCodec,
  LocalTimeCodec,
  DurationCodec,
  RelativeDurationCodec,
  DateDurationCodec,
} from "./datetime";
import { ConfigMemoryCodec } from "./memory";
import {
  PgVectorCodec,
  PgVectorHalfVecCodec,
  PgVectorSparseVecCodec,
} from "./pgvector";
import {
  PostgisBox2dCodec,
  PostgisBox3dCodec,
  PostgisGeometryCodec,
} from "./postgis";
import { InternalClientError } from "../errors";

import type { CodecContext } from "./context";

import { INVALID_CODEC_ID, KNOWN_TYPENAMES, NULL_CODEC_ID } from "./consts";

import type { Float16Array } from "../utils";

// Types for Client.withCodecs() API:
export namespace Codecs {
  export type Codec<T> = {
    toDatabase: (data: any) => T;
    fromDatabase: (data: T) => any;
  };

  export type AnyCodec = {
    toDatabase: (data: any, ...extras: any[]) => any;
    fromDatabase: (data: any, ...extras: any[]) => any;
  };

  export type BoolCodec = Codec<boolean>;
  export type Int16Codec = Codec<number>;
  export type Int32Codec = Codec<number>;
  export type Int64Codec = Codec<bigint>;
  export type Float32Codec = Codec<number>;
  export type Float64Codec = Codec<number>;
  export type BigIntCodec = Codec<bigint>;
  export type DecimalCodec = Codec<string>;
  export type BytesCodec = Codec<Uint8Array>;
  export type DateTimeCodec = Codec<bigint>;
  export type LocalDateTimeCodec = Codec<bigint>;
  export type LocalDateCodec = Codec<
    [years: number, months: number, days: number]
  >;
  export type LocalTimeCodec = Codec<bigint>;
  export type DurationCodec = Codec<bigint>;
  export type RelativeDurationCodec = Codec<
    [months: number, days: number, uSeconds: bigint]
  >;
  export type DateDurationCodec = Codec<[months: number, days: number]>;
  export type JsonCodec = Codec<string>;
  export type MemoryCodec = Codec<bigint>;
  export type PgVectorCodec = Codec<Float32Array>;
  export type PGVectorSparseCodec = Codec<
    [dimensions: number, indexes: Uint32Array, values: Float32Array]
  >;
  export type StrCodec = Codec<string>;
  export type UUIDCodec = Codec<Uint8Array>;

  // TODO: Figure out if we can drop the dep
  // on an external package for Float16Array.
  export type PGVectorHalfCodec = Codec<Float16Array>;

  export type PostgisGeometryCodec = Codec<Uint8Array>;
  export type PostgisGeographyCodec = Codec<Uint8Array>;
  export type PostgisBox2dCodec = Codec<
    [min: [x: number, y: number], max: [x: number, y: number]]
  >;
  export type PostgisBox3dCodec = Codec<
    [
      min: [x: number, y: number, z: number],
      max: [x: number, y: number, z: number],
    ]
  >;

  export type ScalarCodecs = {
    ["std::bool"]: BoolCodec;
    ["std::int16"]: Int16Codec;
    ["std::int32"]: Int32Codec;
    ["std::int64"]: Int64Codec;
    ["std::float32"]: Float32Codec;
    ["std::float64"]: Float64Codec;
    ["std::bigint"]: BigIntCodec;
    ["std::decimal"]: DecimalCodec;
    ["std::bytes"]: BytesCodec;
    ["std::datetime"]: DateTimeCodec;
    ["std::duration"]: DurationCodec;
    ["std::json"]: JsonCodec;
    ["std::str"]: StrCodec;
    ["std::uuid"]: UUIDCodec;

    ["cal::local_date"]: LocalDateCodec;
    ["cal::local_time"]: LocalTimeCodec;
    ["cal::local_datetime"]: LocalDateTimeCodec;
    ["cal::relative_duration"]: RelativeDurationCodec;
    ["cal::date_duration"]: DateDurationCodec;

    ["cfg::memory"]: MemoryCodec;

    ["std::pg::json"]: JsonCodec;
    ["std::pg::timestamptz"]: DateTimeCodec;
    ["std::pg::timestamp"]: LocalDateTimeCodec;
    ["std::pg::date"]: LocalDateCodec;
    ["std::pg::interval"]: RelativeDurationCodec;

    ["ext::pgvector::vector"]: PgVectorCodec;
    ["ext::pgvector::halfvec"]: PGVectorHalfCodec;
    ["ext::pgvector::sparsevec"]: PGVectorSparseCodec;

    ["ext::postgis::geometry"]: PostgisGeometryCodec;
    ["ext::postgis::geography"]: PostgisGeometryCodec;
    ["ext::postgis::box2d"]: PostgisBox2dCodec;
    ["ext::postgis::box3d"]: PostgisBox3dCodec;
  };

  export type SQLRowCodec = {
    fromDatabase: (data: any[], desc: { names: string[] }) => any;
    toDatabase: (data: any, ...extras: any[]) => any;
  };

  export type ContainerCodecs = {
    _private_sql_row: SQLRowCodec;
  };

  export type KnownCodecs = ScalarCodecs & ContainerCodecs;

  export type CodecSpec = Partial<KnownCodecs> & {
    [key: string]: AnyCodec;
  };
}

///////////////////////////////////////////////////////////////////////////////

export class NullCodec extends Codec implements ICodec {
  static BUFFER: Uint8Array = new WriteBuffer().writeInt32(0).unwrap();
  encode(_buf: WriteBuffer, _object: any): void {
    throw new InternalClientError("null codec cannot used to encode data");
  }

  decode(_buf: ReadBuffer, _ctx: CodecContext): any {
    throw new InternalClientError("null codec cannot used to decode data");
  }

  getSubcodecs(): ICodec[] {
    return [];
  }

  getKind(): CodecKind {
    return "scalar";
  }
}

///////////////////////////////////////////////////////////////////////////////

export const SCALAR_CODECS = new Map<uuid, ICodec>();

export const NULL_CODEC = new NullCodec(NULL_CODEC_ID);

export const INVALID_CODEC = new NullCodec(INVALID_CODEC_ID);

///////////////////////////////////////////////////////////////////////////////

type ScalarCodecType = {
  new (tid: string, typeName: string): ScalarCodec;
};

type CodecsToRegister = {
  [key in keyof Codecs.ScalarCodecs]: ScalarCodecType;
};

function registerScalarCodecs(codecs: CodecsToRegister): void {
  for (const [typename, type] of Object.entries(codecs)) {
    const id = KNOWN_TYPENAMES.get(typename);
    if (id == null) {
      throw new InternalClientError("unknown type name");
    }

    SCALAR_CODECS.set(id, new type(id, typename) as unknown as ICodec);
  }
}

registerScalarCodecs({
  "std::int16": Int16Codec,
  "std::int32": Int32Codec,
  "std::int64": Int64Codec,
  "std::float32": Float32Codec,
  "std::float64": Float64Codec,
  "std::bigint": BigIntCodec,
  "std::decimal": DecimalStringCodec,
  "std::bool": BoolCodec,
  "std::json": JSONCodec,
  "std::str": StrCodec,
  "std::bytes": BytesCodec,
  "std::uuid": UUIDCodec,
  "cal::local_date": LocalDateCodec,
  "cal::local_time": LocalTimeCodec,
  "cal::local_datetime": LocalDateTimeCodec,
  "std::datetime": DateTimeCodec,
  "std::duration": DurationCodec,
  "cal::relative_duration": RelativeDurationCodec,
  "cal::date_duration": DateDurationCodec,
  "cfg::memory": ConfigMemoryCodec,

  "std::pg::json": PgTextJSONCodec,
  "std::pg::timestamptz": DateTimeCodec,
  "std::pg::timestamp": LocalDateTimeCodec,
  "std::pg::date": LocalDateCodec,
  "std::pg::interval": RelativeDurationCodec,

  "ext::pgvector::vector": PgVectorCodec,
  "ext::pgvector::halfvec": PgVectorHalfVecCodec,
  "ext::pgvector::sparsevec": PgVectorSparseVecCodec,

  "ext::postgis::geometry": PostgisGeometryCodec,
  "ext::postgis::geography": PostgisGeometryCodec,
  "ext::postgis::box2d": PostgisBox2dCodec,
  "ext::postgis::box3d": PostgisBox3dCodec,
});
