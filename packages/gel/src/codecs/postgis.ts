import {
  type AnyGeometry,
  Box2D,
  Box3D,
  CircularString,
  CompoundCurve,
  CurvePolygon,
  Geometry,
  GeometryCollection,
  LineString,
  MultiCurve,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  MultiSurface,
  Point,
  Polygon,
  PolyhedralSurface,
  Triangle,
  TriangulatedIrregularNetwork,
} from "../datatypes/postgis";
import { InternalClientError, InvalidArgumentError } from "../errors";
import type { ReadBuffer, WriteBuffer } from "../primitives/buffer";
import type { Codecs } from "./codecs";
import type { CodecContext } from "./context";
import { type ICodec, ScalarCodec } from "./ifaces";

export class PostgisGeometryCodec extends ScalarCodec implements ICodec {
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    if (ctx.hasOverload(this)) {
      const geomBuf = ctx.preEncode<Codecs.PostgisGeometryCodec>(this, object);
      buf.writeBytes(geomBuf);
    } else {
      if (!(object instanceof Geometry)) {
        throw new InvalidArgumentError(
          `a Geometry object was expected, got "${object}"`,
        );
      }

      const finalise = buf.writeDeferredSize();
      _encodeGeometry(buf, object as AnyGeometry);
      finalise();
    }
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.PostgisGeometryCodec>(
        this,
        buf.consumeAsBuffer(),
      );
    }

    return _parseGeometry(buf);
  }
}

export class PostgisBox2dCodec extends ScalarCodec implements ICodec {
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    let min: [number, number];
    let max: [number, number];

    if (ctx.hasOverload(this)) {
      [min, max] = ctx.preEncode<Codecs.PostgisBox2dCodec>(this, object);
    } else {
      if (!(object instanceof Box2D)) {
        throw new InvalidArgumentError(
          `a Box2D object was expected, got "${object}"`,
        );
      }
      min = object.min;
      max = object.max;
    }

    const finalise = buf.writeDeferredSize();
    _encodeGeometry(
      buf,
      new Polygon(
        [
          new LineString(
            [
              new Point(min[0], min[1]),
              new Point(min[0], max[1]),
              new Point(max[0], max[1]),
              new Point(min[0], min[1]),
            ],
            false,
            false,
            null,
          ),
        ],
        false,
        false,
        null,
      ),
    );
    finalise();
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const poly = _parseGeometry(buf);
    if (
      poly.constructor !== Polygon ||
      poly.hasZ ||
      poly.rings.length !== 1 ||
      poly.rings[0].points.length !== 5
    ) {
      throw new InternalClientError(
        `failed to decode ext::postgis::box2d type`,
      );
    }
    const points = poly.rings[0].points;
    const min = [points[0].x, points[0].y] as [number, number];
    const max = [points[2].x, points[2].y] as [number, number];

    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.PostgisBox2dCodec>(this, [min, max]);
    }

    return new Box2D(min, max);
  }
}

export class PostgisBox3dCodec extends ScalarCodec implements ICodec {
  encode(buf: WriteBuffer, object: any, ctx: CodecContext): void {
    let min: [number, number, number];
    let max: [number, number, number];

    if (ctx.hasOverload(this)) {
      [min, max] = ctx.preEncode<Codecs.PostgisBox3dCodec>(this, object);
    } else {
      if (!(object instanceof Box3D)) {
        throw new InvalidArgumentError(
          `a Box3D object was expected, got "${object}"`,
        );
      }
      min = object.min;
      max = object.max;
    }

    const finalise = buf.writeDeferredSize();
    _encodeGeometry(
      buf,
      new Polygon(
        [
          new LineString(
            [
              new Point(min[0], min[1], min[2]),
              new Point(min[0], max[1], max[2]),
              new Point(max[0], max[1], max[2]),
              new Point(min[0], min[1], min[2]),
            ],
            true,
            false,
            null,
          ),
        ],
        true,
        false,
        null,
      ),
    );
    finalise();
  }

  decode(buf: ReadBuffer, ctx: CodecContext): any {
    const poly = _parseGeometry(buf);

    let min: Point;
    let max: Point;
    if (
      poly.constructor === Polygon &&
      poly.rings.length === 1 &&
      poly.rings[0].points.length === 5
    ) {
      const points = poly.rings[0].points;
      min = points[0];
      max = points[2];
    } else if (
      poly.constructor === PolyhedralSurface &&
      poly.geometries.length === 6 &&
      poly.geometries[0].rings.length === 1 &&
      poly.geometries[0].rings[0].points.length === 5
    ) {
      min = poly.geometries[0].rings[0].points[0];
      max = poly.geometries[5].rings[0].points[2];
    } else {
      throw new InternalClientError(
        `failed to decode ext::postgis::box3d type`,
      );
    }

    if (ctx.hasOverload(this)) {
      return ctx.postDecode<Codecs.PostgisBox3dCodec>(this, [
        [min.x, min.y, min.z ?? 0],
        [max.x, max.y, max.z ?? 0],
      ]);
    }

    return new Box3D([min.x, min.y, min.z ?? 0], [max.x, max.y, max.z ?? 0]);
  }
}

const zFlag = 0x80000000;
const mFlag = 0x40000000;
const sridFlag = 0x20000000;
const allFlags = zFlag | mFlag | sridFlag;

function _parseGeometry(
  buf: ReadBuffer,
  srid: number | null = null,
): AnyGeometry {
  const le = buf.readUInt8() === 1;
  let type = buf.readUInt32(le);
  const z = (type & zFlag) !== 0;
  const m = (type & mFlag) !== 0;

  if ((type & sridFlag) !== 0) {
    srid = buf.readUInt32(le);
  }

  type = type & ~allFlags;
  switch (type) {
    case 1:
      return _parsePoint(buf, le, z, m, srid);
    case 2:
      return _parseLineString(buf, LineString, le, z, m, srid);
    case 3:
      return _parsePolygon(buf, Polygon, le, z, m, srid);
    case 4:
      return _parseMultiPoint(buf, le, z, m, srid);
    case 5:
      return _parseMultiLineString(buf, le, z, m, srid);
    case 6:
      return _parseMultiPolygon(buf, MultiPolygon, le, z, m, srid);
    case 7:
      return _parseGeometryCollection(buf, le, z, m, srid);
    case 8:
      return _parseLineString(buf, CircularString, le, z, m, srid);
    case 9:
      return _parseCompoundCurve(buf, le, z, m, srid);
    case 10:
      return _parseMultiCurve(buf, CurvePolygon, le, z, m, srid);
    case 11:
      return _parseMultiCurve(buf, MultiCurve, le, z, m, srid);
    case 12:
      return _parseMultiSurface(buf, le, z, m, srid);
    case 15:
      return _parseMultiPolygon(buf, PolyhedralSurface, le, z, m, srid);
    case 16:
      return _parseMultiPolygon(
        buf,
        TriangulatedIrregularNetwork,
        le,
        z,
        m,
        srid,
      );
    case 17:
      return _parsePolygon(buf, Triangle, le, z, m, srid);
    default:
      throw new Error(`unsupported wkb type: ${type}`);
  }
}

function _parsePoint(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  return new Point(
    buf.readFloat64(le),
    buf.readFloat64(le),
    z ? buf.readFloat64(le) : null,
    m ? buf.readFloat64(le) : null,
    srid,
  );
}

function _parseLineString(
  buf: ReadBuffer,
  cls: typeof LineString | typeof CircularString,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const pointCount = buf.readUInt32(le);
  const points: Point[] = new Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    points[i] = _parsePoint(buf, le, z, m, srid);
  }
  return new cls(points, z, m, srid);
}

function _parsePolygon(
  buf: ReadBuffer,
  cls: typeof Polygon,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const ringCount = buf.readUInt32(le);
  const rings: LineString[] = new Array(ringCount);
  for (let i = 0; i < ringCount; i++) {
    rings[i] = _parseLineString(buf, LineString, le, z, m, srid);
  }
  return new cls(rings, z, m, srid);
}

function _parseMultiPoint(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const pointCount = buf.readUInt32(le);
  const points: Point[] = new Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    buf.discard(5);
    points[i] = _parsePoint(buf, le, z, m, srid);
  }
  return new MultiPoint(points, z, m, srid);
}

function _parseMultiLineString(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const lineStringCount = buf.readUInt32(le);
  const lineStrings: LineString[] = new Array(lineStringCount);
  for (let i = 0; i < lineStringCount; i++) {
    buf.discard(5);
    lineStrings[i] = _parseLineString(buf, LineString, le, z, m, srid);
  }
  return new MultiLineString(lineStrings, z, m, srid);
}

function _parseCompoundCurve(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const curveCount = buf.readUInt32(le);
  const curves: (LineString | CircularString)[] = new Array(curveCount);
  for (let i = 0; i < curveCount; i++) {
    buf.discard(1);
    const type = buf.readUInt32(le) & ~allFlags;
    switch (type) {
      case 2:
        curves[i] = _parseLineString(buf, LineString, le, z, m, srid);
        break;
      case 8:
        curves[i] = _parseLineString(buf, CircularString, le, z, m, srid);
        break;
      default:
        throw new Error(`unexpected type ${type} in CompoundCurve`);
    }
  }
  return new CompoundCurve(curves, z, m, srid);
}

function _parseMultiCurve(
  buf: ReadBuffer,
  cls: typeof MultiCurve | typeof CurvePolygon,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const curveCount = buf.readUInt32(le);
  const curves: (LineString | CircularString | CompoundCurve)[] = new Array(
    curveCount,
  );
  for (let i = 0; i < curveCount; i++) {
    buf.discard(1);
    const type = buf.readUInt32(le) & ~allFlags;
    switch (type) {
      case 2:
        curves[i] = _parseLineString(buf, LineString, le, z, m, srid);
        break;
      case 8:
        curves[i] = _parseLineString(buf, CircularString, le, z, m, srid);
        break;
      case 9:
        curves[i] = _parseCompoundCurve(buf, le, z, m, srid);
        break;
      default:
        throw new Error(`unexpected type ${type} in MultiCurve/CurvePolygon`);
    }
  }
  return new cls(curves, z, m, srid);
}

function _parseMultiPolygon(
  buf: ReadBuffer,
  cls: typeof MultiPolygon,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const polyCls = cls === TriangulatedIrregularNetwork ? Triangle : Polygon;
  const polyCount = buf.readUInt32(le);
  const polys: Polygon[] = new Array(polyCount);
  for (let i = 0; i < polyCount; i++) {
    buf.discard(5);
    polys[i] = _parsePolygon(buf, polyCls, le, z, m, srid);
  }
  return new cls(polys, z, m, srid);
}

function _parseMultiSurface(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const surfaceCount = buf.readUInt32(le);
  const surfaces: (Polygon | CurvePolygon)[] = new Array(surfaceCount);
  for (let i = 0; i < surfaceCount; i++) {
    buf.discard(1);
    const type = buf.readUInt32(le) & ~allFlags;
    switch (type) {
      case 3:
        surfaces[i] = _parsePolygon(buf, Polygon, le, z, m, srid);
        break;
      case 10:
        surfaces[i] = _parseMultiCurve(
          buf,
          CurvePolygon,
          le,
          z,
          m,
          srid,
        ) as CurvePolygon;
        break;
      default:
        throw new Error(`unexpected type ${type} in MultiSurface`);
    }
  }
  return new MultiSurface(surfaces, z, m, srid);
}

function _parseGeometryCollection(
  buf: ReadBuffer,
  le: boolean,
  z: boolean,
  m: boolean,
  srid: number | null,
) {
  const geometryCount = buf.readUInt32(le);
  const geometries: AnyGeometry[] = new Array(geometryCount);
  for (let i = 0; i < geometryCount; i++) {
    geometries[i] = _parseGeometry(buf, srid);
  }
  return new GeometryCollection(geometries, z, m, srid);
}

const geomTypes = new Map<any, number>([
  [Point, 1],
  [LineString, 2],
  [Polygon, 3],
  [MultiPoint, 4],
  [MultiLineString, 5],
  [MultiPolygon, 6],
  [GeometryCollection, 7],
  [CircularString, 8],
  [CompoundCurve, 9],
  [CurvePolygon, 10],
  [MultiCurve, 11],
  [MultiSurface, 12],
  [PolyhedralSurface, 15],
  [TriangulatedIrregularNetwork, 16],
  [Triangle, 17],
]);

function _encodeGeometry(buf: WriteBuffer, geom: AnyGeometry) {
  buf.writeUInt8(0);
  const type = geomTypes.get(geom.constructor);
  if (!type) {
    throw new Error(`unknown geometry type ${geom}`);
  }
  buf.writeUInt32(
    type |
      (geom.hasZ ? zFlag : 0) |
      (geom.hasM ? mFlag : 0) |
      (geom.srid !== null ? sridFlag : 0),
  );

  if (geom.srid !== null) {
    buf.writeUInt32(geom.srid);
  }

  if (geom instanceof Point) {
    _encodePoint(buf, geom);
    return;
  }
  if (geom instanceof LineString) {
    _encodeLineString(buf, geom);
    return;
  }
  if (geom instanceof Polygon) {
    buf.writeUInt32(geom.rings.length);
    for (const ring of geom.rings) {
      _encodeLineString(buf, ring);
    }
    return;
  }

  buf.writeUInt32(geom.geometries.length);
  for (const point of geom.geometries) {
    _encodeGeometry(buf, point);
  }
}

function _encodePoint(buf: WriteBuffer, point: Point) {
  buf.writeFloat64(point.x);
  buf.writeFloat64(point.y);
  if (point.z !== null) buf.writeFloat64(point.z);
  if (point.m !== null) buf.writeFloat64(point.m);
}

function _encodeLineString(buf: WriteBuffer, linestring: LineString) {
  buf.writeUInt32(linestring.points.length);
  for (const point of linestring.points) {
    _encodePoint(buf, point);
  }
}
