import {
  type AnyGeometry,
  type Geometry,
  GeometryCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Triangle,
  TriangulatedIrregularNetwork,
  PolyhedralSurface,
  CircularString,
  CompoundCurve,
  CurvePolygon,
  MultiCurve,
  MultiSurface,
} from "./postgis";

const sridRegex = /\s*SRID=([0-9]+)\s*;/iy;
const endRegex = /\s*$/y;
const geomTypes = [
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTILINESTRING",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
  "POLYHEDRALSURFACE",
  "TRIANGLE",
  "TIN",
  "CIRCULARSTRING",
  "COMPOUNDCURVE",
  "CURVEPOLYGON",
  "MULTICURVE",
  "MULTISURFACE",
] as const;
const geomTypeRegex = new RegExp(`\\s*(${geomTypes.join("|")})`, "iy");
const zmFlagsRegex = /\s+(ZM|Z|M)/iy;
const emptyOrOpenRegex = /\s+(EMPTY)|\s*\(/iy;
const openRegex = /\s*\(/y;
const closeRegex = /\s*\)/y;
const commaRegex = /\s*,/y;

const _num = "-?[0-9]+(?:\\.[0-9]+)?";
const pointRegex = new RegExp(
  `\\s*(${_num})\\s+(${_num})(?:\\s+(${_num}))?(?:\\s+(${_num}))?`,
  "y",
);

export function parseWKT(wkt: string) {
  let i = 0;
  let hasZ: boolean | null = null;
  let hasM: boolean | null = null;

  let srid: number | null = null;
  sridRegex.lastIndex = i;
  const _srid = sridRegex.exec(wkt);
  if (_srid) {
    srid = parseInt(_srid[1], 10);
    i += _srid[0].length;
  }

  const geom = _parseGeom();

  endRegex.lastIndex = i;
  if (endRegex.exec(wkt) === null) {
    throw createParseError(wkt, i, "expected end of wkt");
  }

  return geom;

  function _parseGeom(
    unnamedGeom: (typeof geomTypes)[number] | null = null,
    allowedGeoms: (typeof geomTypes)[number][] | null = null,
  ): AnyGeometry {
    geomTypeRegex.lastIndex = i;
    const _geomType = geomTypeRegex.exec(wkt);
    const type = (_geomType?.[1].toUpperCase() ??
      unnamedGeom) as (typeof geomTypes)[number];
    if (!type || (allowedGeoms && !allowedGeoms.includes(type))) {
      throw createParseError(
        wkt,
        i,
        `expected one of ${(allowedGeoms ? ["(", ...allowedGeoms] : geomTypes).join(", ")}`,
      );
    }
    i += _geomType?.[0].length ?? 0;

    if (_geomType !== null) {
      zmFlagsRegex.lastIndex = i;
      const _zmFlags = zmFlagsRegex.exec(wkt);
      if (_zmFlags !== null) {
        const zm = _zmFlags[1].toLowerCase();
        hasZ = zm === "zm" || zm === "z";
        hasM = zm === "zm" || zm === "m";
        i += _zmFlags[0].length;
      } else {
        hasZ = null;
        hasM = null;
      }
    }

    const open = _geomType === null ? openRegex : emptyOrOpenRegex;
    open.lastIndex = i;
    const _emptyOrOpen = open.exec(wkt);
    if (_emptyOrOpen === null) {
      throw createParseError(
        wkt,
        i,
        _geomType === null ? `expected (` : `expected EMPTY or (`,
      );
    }
    i += _emptyOrOpen[0].length;

    const empty = _emptyOrOpen[1] != null;

    let geom: AnyGeometry;

    switch (type) {
      case "POINT":
        geom = _parsePoint(empty);
        break;
      case "LINESTRING":
      case "CIRCULARSTRING":
        geom = _parseLineString(
          empty,
          type === "CIRCULARSTRING" ? CircularString : LineString,
        );
        break;
      case "POLYGON":
      case "TRIANGLE":
        geom = _parsePolygon(empty, type === "TRIANGLE" ? Triangle : Polygon);
        break;
      case "MULTIPOINT":
        geom = new MultiPoint(
          empty ? [] : _parseCommaSep(() => _parseBracketedGeom(_parsePoint)),
          hasZ ?? false,
          hasM ?? false,
          srid,
        );
        break;
      case "MULTILINESTRING":
        geom = new MultiLineString(
          empty
            ? []
            : _parseCommaSep(() => _parseBracketedGeom(_parseLineString)),
          hasZ ?? false,
          hasM ?? false,
          srid,
        );
        break;
      case "MULTIPOLYGON":
      case "POLYHEDRALSURFACE":
      case "TIN":
        {
          const Geom =
            type === "TIN"
              ? TriangulatedIrregularNetwork
              : type === "POLYHEDRALSURFACE"
                ? PolyhedralSurface
                : MultiPolygon;
          geom = new Geom(
            empty
              ? []
              : _parseCommaSep(() =>
                  _parseBracketedGeom(() =>
                    _parsePolygon(false, type === "TIN" ? Triangle : Polygon),
                  ),
                ),
            hasZ ?? false,
            hasM ?? false,
            srid,
          );
        }
        break;
      case "GEOMETRYCOLLECTION": {
        geom = new GeometryCollection(
          empty ? [] : _checkDimensions(() => _parseCommaSep(_parseGeom)),
          hasZ ?? false,
          hasM ?? false,
          srid,
        );
        break;
      }
      case "COMPOUNDCURVE":
        {
          const segments = empty
            ? []
            : (_checkDimensions(() =>
                _parseCommaSep(() =>
                  _parseGeom("LINESTRING", ["LINESTRING", "CIRCULARSTRING"]),
                ),
              ) as (LineString | CircularString)[]);
          geom = new CompoundCurve(
            segments,
            hasZ ?? false,
            hasM ?? false,
            srid,
          );
        }
        break;
      case "CURVEPOLYGON":
      case "MULTICURVE":
        {
          const rings = empty
            ? []
            : (_checkDimensions(() =>
                _parseCommaSep(() =>
                  _parseGeom("LINESTRING", [
                    "LINESTRING",
                    "CIRCULARSTRING",
                    "COMPOUNDCURVE",
                  ]),
                ),
              ) as (LineString | CircularString | CompoundCurve)[]);
          const Geom = type === "MULTICURVE" ? MultiCurve : CurvePolygon;
          geom = new Geom(rings, hasZ ?? false, hasM ?? false, srid);
        }
        break;

      case "MULTISURFACE":
        {
          const surfaces = empty
            ? []
            : (_checkDimensions(() =>
                _parseCommaSep(() =>
                  _parseGeom("POLYGON", ["POLYGON", "CURVEPOLYGON"]),
                ),
              ) as (Polygon | CurvePolygon)[]);
          geom = new MultiSurface(surfaces, hasZ ?? false, hasM ?? false, srid);
        }
        break;

      default:
        assertNever(type, `unknown geometry type ${type}`);
    }

    if (!empty) {
      closeRegex.lastIndex = i;
      const _close = closeRegex.exec(wkt);
      if (_close === null) {
        throw createParseError(wkt, i, `expected )`);
      }
      i += _close[0].length;
    }

    return geom;
  }

  function _parsePoint(empty = false): Point {
    if (empty) {
      return new Point(NaN, NaN, hasZ ? NaN : null, hasM ? NaN : null, srid);
    }

    pointRegex.lastIndex = i;
    const coords = pointRegex.exec(wkt);
    if (coords === null) {
      throw createParseError(wkt, i, `expected between 2 to 4 coordinates`);
    }
    const x = parseFloat(coords[1]);
    const y = parseFloat(coords[2]);
    const z = coords[3] ? parseFloat(coords[3]) : null;
    const m = coords[4] ? parseFloat(coords[4]) : null;
    if (hasZ === null) {
      hasZ = z !== null;
      hasM = m !== null;
    } else {
      if (m === null) {
        if (hasZ && hasM) {
          throw createParseError(wkt, i, `expected M coordinate`);
        }
      } else {
        if (!hasM) {
          throw createParseError(wkt, i, `unexpected M coordinate`);
        }
      }
      if (z === null) {
        if (hasZ || hasM) {
          throw createParseError(
            wkt,
            i,
            `expected ${hasZ ? "Z" : "M"} coordinate`,
          );
        }
      } else {
        if (!hasZ && (!hasM || m !== null)) {
          throw createParseError(wkt, i, `unexpected Z coordinate`);
        }
      }
    }
    i += coords[0].length;
    return new Point(x, y, hasZ ? z : null, hasZ ? m : z, srid);
  }

  function _parseLineString(
    empty = false,
    Geom: typeof LineString | typeof CircularString = LineString,
  ) {
    return new Geom(
      empty ? [] : _parseCommaSep(_parsePoint),
      hasZ ?? false,
      hasM ?? false,
      srid,
    );
  }

  function _parsePolygon(
    empty = false,
    Geom: typeof Polygon | typeof Triangle = Polygon,
  ) {
    return new Geom(
      empty ? [] : _parseCommaSep(() => _parseBracketedGeom(_parseLineString)),
      hasZ ?? false,
      hasM ?? false,
      srid,
    );
  }

  function _parseCommaSep<Geom extends Geometry>(parseGeom: () => Geom) {
    const geoms: Geom[] = [parseGeom()];

    while (true) {
      commaRegex.lastIndex = i;
      const comma = commaRegex.exec(wkt);
      if (comma === null) {
        break;
      }
      i += comma[0].length;
      geoms.push(parseGeom());
    }

    return geoms;
  }

  function _parseBracketedGeom<Geom extends Geometry>(parseGeom: () => Geom) {
    openRegex.lastIndex = i;
    const open = openRegex.exec(wkt);
    if (open === null) {
      throw createParseError(wkt, i, `expected (`);
    }
    i += open[0].length;

    const geom = parseGeom();

    closeRegex.lastIndex = i;
    const close = closeRegex.exec(wkt);
    if (close === null) {
      throw createParseError(wkt, i, `expected )`);
    }
    i += close[0].length;

    return geom;
  }

  function _checkDimensions<Geom extends AnyGeometry>(
    parseChildren: () => Geom[],
  ) {
    const parentZ = hasZ;
    const parentM = hasM;
    const geoms = parseChildren();
    hasZ = parentZ ?? geoms[0].hasZ ?? false;
    hasM = parentM ?? geoms[0].hasM ?? false;
    if (geoms.some((geom) => geom.hasZ !== hasZ || geom.hasM !== hasM)) {
      throw createParseError(wkt, i, `child geometries have mixed dimensions`);
    }
    return geoms;
  }
}

function createParseError(_wkt: string, index: number, error: string) {
  return new Error(`${error} at position ${index}`);
}

function assertNever(_type: never, message: string): never {
  throw new Error(message);
}
