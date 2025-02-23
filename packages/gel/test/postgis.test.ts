import { expect } from "@jest/globals";

import { getAvailableExtensions, getClient } from "./testbase";
import {
  Box2D,
  Box3D,
  CircularString,
  Codecs,
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
  parseWKT,
} from "../src/index.shared";
import { CodecValueType } from "../src/codecs/context";

const geomTestcases: [string, any][] = [
  ["POINT EMPTY", Point],
  ["POINT Z EMPTY", Point],
  ["POINT M EMPTY", Point],
  ["POINT ZM EMPTY", Point],
  ["POINT (1 2) ", Point],
  ["POINT (1 2 3)", Point],
  ["POINT(1 2 3 4)", Point],
  ["POINT Z (1 2 3)", Point],
  ["POINT M (1 2 4)", Point],
  ["POINT ZM (1 2 3 4)", Point],
  ["LINESTRING Z EMPTY", LineString],
  ["LINESTRING (1 2, 3 4, 5 6)", LineString],
  ["LINESTRING Z (1 2 4, 3 4 5, 5 6 7)", LineString],
  ["LINESTRING M (1 2 4, 3 4 5, 5 6 7)", LineString],
  ["LINESTRING ZM (1 2 4 5, 3 4 5 6, 5 6 7 8)", LineString],
  ["POLYGON EMPTY", Polygon],
  [
    "POLYGON M ((0 0 0,4 0 0,4 4 0,0 4 0,0 0 0),(1 1 0,2 1 0,2 2 0,1 2 0,1 1 0))",
    Polygon,
  ],
  ["MULTIPOINT EMPTY", MultiPoint],
  ["MULTIPOINT Z EMPTY", MultiPoint],
  ["MULTIPOINT M ( (0 0 1), (1 2 3) )", MultiPoint],
  [
    "MULTILINESTRING M ( (0 0 8,1 1 7,1 2 6), (2 3 5,3 2 4,5 4 3) )",
    MultiLineString,
  ],
  [
    "MULTIPOLYGON M (((1 5 9, 5 5 8, 5 1 7, 1 1 6, 1 5 9)), ((6 5 4, 9 1 3, 6 1 2, 6 5 4)))",
    MultiPolygon,
  ],
  ["GEOMETRYCOLLECTION Z EMPTY", GeometryCollection],
  [
    "GEOMETRYCOLLECTION ( POINT(2 3), LINESTRING(2 3, 3 4))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION ( POINT M (2 3 4), LINESTRING M (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION ( POINT Z (2 3 4), LINESTRING (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION ( GEOMETRYCOLLECTION (POINT (2 3 4)), LINESTRING (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION ( GEOMETRYCOLLECTION (POINT Z (2 3 4)), LINESTRING (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION Z ( GEOMETRYCOLLECTION (POINT (2 3 4)), LINESTRING (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    "GEOMETRYCOLLECTION ( GEOMETRYCOLLECTION (POINT M (2 3 4)), LINESTRING M (2 3 5, 3 4 6))",
    GeometryCollection,
  ],
  [
    `POLYHEDRALSURFACE Z (
((0 0 0, 0 0 1, 0 1 1, 0 1 0, 0 0 0)),
((0 0 0, 0 1 0, 1 1 0, 1 0 0, 0 0 0)),
((0 0 0, 1 0 0, 1 0 1, 0 0 1, 0 0 0)),
((1 1 0, 1 1 1, 1 0 1, 1 0 0, 1 1 0)),
((0 1 0, 0 1 1, 1 1 1, 1 1 0, 0 1 0)),
((0 0 1, 1 0 1, 1 1 1, 0 1 1, 0 0 1)) )`,
    PolyhedralSurface,
  ],
  ["TRIANGLE EMPTY", Triangle],
  ["TRIANGLE Z ((5 6 4, 7 8 5, 9 10 6, 5 6 4))", Triangle],
  ["TRIANGLE ((5 6 7, 7 8 9, 9 10 11, 5 6 7))", Triangle],
  [
    "TIN Z ( ((0 0 0, 0 0 1, 0 1 0, 0 0 0)), ((0 0 0, 0 1 0, 1 1 0, 0 0 0)) )",
    TriangulatedIrregularNetwork,
  ],
  ["TIN Z ( ((0 0 0, 0 0 1, 0 1 0, 0 0 0)) )", TriangulatedIrregularNetwork],
  ["CIRCULARSTRING EMPTY", CircularString],
  ["CIRCULARSTRING(0 0, 1 1, 1 0)", CircularString],
  ["CIRCULARSTRING(0 0, 4 0, 4 4, 0 4, 0 0)", CircularString],
  ["COMPOUNDCURVE EMPTY", CompoundCurve],
  ["COMPOUNDCURVE( CIRCULARSTRING(1 2, 3 4, 5 6),(5 6, 7 8))", CompoundCurve],
  ["COMPOUNDCURVE( CIRCULARSTRING(0 0, 1 1, 1 0),(1 0, 0 1))", CompoundCurve],
  ["MULTICURVE EMPTY", MultiCurve],
  ["MULTICURVE( (0 0, 5 5), CIRCULARSTRING(4 0, 4 4, 8 4))", MultiCurve],
  [
    "MULTICURVE( LINESTRING(0 0, 5 5), CIRCULARSTRING(4 0, 4 4, 8 4))",
    MultiCurve,
  ],
  [
    `MULTICURVE(
COMPOUNDCURVE( CIRCULARSTRING(0 0,2 0, 2 1, 2 3, 4 3),
               (4 3, 4 5, 1 4, 0 0)),
CIRCULARSTRING(1.7 1, 1.4 0.4, 1.6 0.4, 1.6 0.5, 1.7 1) )`,
    MultiCurve,
  ],
  ["CURVEPOLYGON EMPTY", CurvePolygon],
  [
    `CURVEPOLYGON(
  CIRCULARSTRING(0 0, 4 0, 4 4, 0 4, 0 0),
  (1 1, 3 3, 3 1, 1 1) )`,
    CurvePolygon,
  ],
  [
    `CURVEPOLYGON(
  CIRCULARSTRING(0 0, 4 0, 4 4, 0 4, 0 0),
  LINESTRING(1 1, 3 3, 3 1, 1 1) )`,
    CurvePolygon,
  ],
  [
    `CURVEPOLYGON(
COMPOUNDCURVE( CIRCULARSTRING(0 0,2 0, 2 1, 2 3, 4 3),
               (4 3, 4 5, 1 4, 0 0)),
CIRCULARSTRING(1.7 1, 1.4 0.4, 1.6 0.4, 1.6 0.5, 1.7 1) )`,
    CurvePolygon,
  ],
  ["MULTISURFACE EMPTY", MultiSurface],
  [
    `MULTISURFACE(
CURVEPOLYGON(
  CIRCULARSTRING( 0 0, 4 0,
   4 4, 0 4, 0 0
   ),
  (1 1, 3
   3, 3 1, 1 1)),
((10 10, 14 12, 11 10, 10 
10), (11 11, 11.5 11, 11 11.5 
  , 11 11)))`,
    MultiSurface,
  ],
];

const failureTestcases: string[] = [
  "POINT", // no coords
  "POINT ()", // no coords
  "POINT EMPTY ()", // empty + parens
  "POINT (1, 2, 3)", // comma separated coords
  "POINT (1 2", // missing closing paren
  "POINT (1 2) POINT (3 4)", // multiple geoms
  "POINT MZ (1 2 3 4)", // MZ invalid
  "POINT Z M (1 2 3 4)", // space between Z M
  "POINT Z (1 2)", // no Z coord
  "POINT ZM (1 2 3)", // no M coord
  "POINT Z (1 2 3 4)", // unexpected M
  "POINT M (1 2 3 4)", // unexpected Z
  "LINESTRING ()", // no points
  "LINESTRING (1 2 3)", // need at least 2 points
  "LINESTRING (1 2 3, 3 4 5,)", // trailing comma
  "LINESTRING (1 2, 3 4 5)", // different dimensions
  "POLYGON (1 2 3, 4 5 6)", // points not in ring parens
  "POLYGON ((1 2 3, 4 5 3, 1 2 3))", // need at least 4 points
  "POLYGON ((1 2 3, 3 4 5, 2 3 4, 1 2 3), (5 6, 6 7, 5 7, 5 6))", // different dimensions
  "POLYGON ((1 2 3, 3 4 3, 5 2 3, 6 1 3))", // unclosed ring
  "POLYGON M ((1 2 3 4, 1 2 4 5, 2 3 4 6, 1 2 3 4))", // different dimensions
  "GEOMETRYCOLLECTION Z ( POINT M (2 3 4), LINESTRING M (2 3 5, 3 4 6))", // different dimensions
  "GEOMETRYCOLLECTION M ( POINT (2 3 4), LINESTRING (2 3 5, 3 4 6))", // different dimensions
  "GEOMETRYCOLLECTION M ( POINT M (2 3 4), LINESTRING (2 3 5, 3 4 6))", // different dimensions
  "GEOMETRYCOLLECTION ( POINT M (2 3 4), LINESTRING (2 3 5, 3 4 6))", // different dimensions
  "GEOMETRYCOLLECTION ( GEOMETRYCOLLECTION (POINT M (2 3 4)), LINESTRING (2 3 5, 3 4 6))", // different dimensions
  "GEOMETRYCOLLECTION ( GEOMETRYCOLLECTION M (POINT (2 3 4)), LINESTRING M (2 3 5, 3 4 6))", // different dimensions
  "TRIANGLE Z ((5 6 4, 7 8 5, 9 10 6, 7 9 5, 5 6 4))", // too many points
  "TRIANGLE Z ((5 6 4, 7 8 5, 9 10 6, 5 6 4), (0 0 0, 0 0 1, 0 1 0, 0 0 0))", // too many rings
  "CIRCULARSTRING(0 0, 4 0, 4 4, 0 4)", // non odd number of points
  "COMPOUNDCURVE( CIRCULARSTRING(1 2, 3 4, 5 6),(4 5, 7 8))", // segment start/ends don't match
  `CURVEPOLYGON(
    CIRCULARSTRING(0 0, 4 0, 4 4, 0 4, 1 0),
    (1 1, 3 3, 3 1, 1 1)
  )`, // ring not closed
  `CURVEPOLYGON(
    COMPOUNDCURVE(
      CIRCULARSTRING(0 0,2 0, 2 1, 2 3, 4 3),
      (4 3, 4 5, 1 4, 0 1)
    ),
    CIRCULARSTRING(1.7 1, 1.4 0.4, 1.6 0.4, 1.6 0.5, 1.7 1)
  )`, // ring not closed
];

function areGeomsEqual(a: unknown, b: unknown): boolean | undefined {
  const isAGeom = a instanceof Geometry;
  const isBGeom = b instanceof Geometry;

  if (
    isAGeom !== isBGeom ||
    (isAGeom && isBGeom && a.constructor !== b.constructor)
  ) {
    return false;
  }
  // delegate to another matcher
  return undefined;
}

expect.addEqualityTesters([areGeomsEqual]);

if (getAvailableExtensions().get("postgis")) {
  describe("fetch: ext::postgis", () => {
    const con = getClient();

    beforeAll(async () => {
      await con.execute("create extension postgis;");
    }, 60_000);

    afterAll(async () => {
      await con.execute("drop extension postgis;");
      await con.close();
    }, 30_000);

    it("geometry type decode / encode / toWKT / parseWKT", async () => {
      const testcases = [
        ...geomTestcases,
        ...geomTestcases.map((tc) => [
          ("SRID=1234;" + tc[0]).toLowerCase(),
          tc[1],
        ]),
        [
          `LINESTRING ZM (${Array(20)
            .fill(0)
            .map(
              () =>
                `${Math.random() * 360 - 180} ${
                  Math.random() * 180 - 90
                } ${Math.random() * 100 - 50} ${Math.random() * 100 - 50}`,
            )
            .join(", ")})`,
          LineString,
        ],
      ];

      const geoms = await con.queryRequiredSingle<Geometry[]>(
        `
      select <array<ext::postgis::geometry>><array<str>>$wkt
    `,
        { wkt: testcases.map(([wkt]) => wkt) },
      );

      expect(geoms).toHaveLength(testcases.length);
      for (let i = 0; i < geoms.length; i++) {
        expect(geoms[i]).toBeInstanceOf(testcases[i][1]);
        expect(geoms[i]).toEqual(parseWKT(testcases[i][0]));
      }

      await expect(
        con.queryRequiredSingle<true>(
          `
      with
        geomsFromWKT := <array<ext::postgis::geometry>><array<str>>$origWKT,
        geomsFromBinary := <array<ext::postgis::geometry>>$geoms,
        geomsFromLibWKT := <array<ext::postgis::geometry>><array<str>>$libWKT,
        geomsFromParsedWKT := <array<ext::postgis::geometry>>$parsedWKT
      select
            assert(geomsFromWKT = geomsFromBinary)
        and assert(geomsFromWKT = geomsFromLibWKT)
        and assert(geomsFromBinary = geomsFromParsedWKT)
    `,
          {
            origWKT: testcases.map(([wkt]) => wkt),
            geoms: geoms,
            libWKT: geoms.map((g) => g.toWKT()),
            parsedWKT: testcases.map(([wkt]) => parseWKT(wkt)),
          },
        ),
      ).resolves.not.toThrow();

      expect(
        await con.queryRequiredSingle(
          `select <array<ext::postgis::geometry>>$geoms`,
          { geoms },
        ),
      ).toEqual(geoms);
    });

    it("invalid geometry", async () => {
      for (const testcase of failureTestcases) {
        await expect(
          con.querySingle(`select <ext::postgis::geometry><str>$wkt`, {
            wkt: testcase,
          }),
        ).rejects.toThrow();

        expect(() => parseWKT(testcase)).toThrow();
      }
    });

    it("Box2D/Box3D decode / encode / toString", async () => {
      const testcases: [string, string, any][] = [
        ["box2d", "BOX(1 2, 3 4)", Box2D],
        ["box3d", "BOX3D(1 2 3, 4 5 6)", Box3D],
        [
          "box3d",
          `BOX3D(${Math.random() * -180} ${Math.random() * -90} ${
            Math.random() * -50
          }, ${Math.random() * 180} ${Math.random() * 90} ${Math.random() * 50})`,
          Box3D,
        ],
      ];

      for (const testcase of testcases) {
        const box = await con.queryRequiredSingle<Box2D | Box3D>(
          `
      select <ext::postgis::${testcase[0]}><str>$box
    `,
          { box: testcase[1] },
        );

        expect(box).toBeInstanceOf(testcase[2]);

        await expect(
          con.queryRequiredSingle<true>(
            `
      with
        boxFromStr := <ext::postgis::${testcase[0]}><str>$origBoxStr,
        boxFromBinary := <ext::postgis::${testcase[0]}>$box,
        boxFromToStr := <ext::postgis::${testcase[0]}><str>$boxToStr
      select
            assert(boxFromStr = boxFromBinary)
        and assert(boxFromStr = boxFromToStr)
    `,
            {
              origBoxStr: testcase[1],
              box: box,
              boxToStr: box.toString(),
            },
          ),
        ).resolves.not.toThrow();
      }
    });

    it("withCodecs", async () => {
      class Value {
        constructor(
          public type: string,
          public value: any,
        ) {}
      }

      const geomBuf = new Uint8Array([
        1, 3, 0, 0, 96, 230, 16, 0, 0, 2, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        16, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 16, 64, 0, 0, 0, 0, 0, 0, 16, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 240, 63,
        0, 0, 0, 0, 0, 0, 0, 0,
      ]);

      const postgisCodecs: {
        [key in
          | "ext::postgis::geometry"
          | "ext::postgis::geography"
          | "ext::postgis::box3d"
          | "ext::postgis::box2d"]: CodecValueType<Codecs.KnownCodecs[key]>;
      } = {
        "ext::postgis::geometry": geomBuf,
        "ext::postgis::geography": geomBuf,
        "ext::postgis::box2d": [
          [5, 6],
          [10, 11],
        ],
        "ext::postgis::box3d": [
          [5, 6, 7],
          [10, 11, 12],
        ],
      };

      const con = getClient().withCodecs(
        Object.fromEntries(
          Object.keys(postgisCodecs).map((tn) => {
            return [
              tn,
              {
                toDatabase(data: Value): any {
                  return data.value;
                },
                fromDatabase(data: any): Value {
                  return new Value(tn, data);
                },
              },
            ];
          }),
        ),
      );

      let args: any[] = [];
      let query = "select (";
      for (let [idx, [type, value]] of Object.entries(
        postgisCodecs,
      ).entries()) {
        query += `<${type}>\$${idx},`;
        args.push(new Value(type, value));
      }
      query += ")";

      try {
        const ret = (await con.querySingle(query, args)) as Array<Value>;

        expect(ret.length).toBe(args.length);

        for (let i = 0; i < ret.length; i++) {
          const tn = ret[i].type;
          expect(tn).toBe(args[i].type);

          try {
            expect(ret[i].value).toStrictEqual(args[i].value);
          } catch (e) {
            console.error(`type ${tn}`);
            throw e;
          }
        }
      } finally {
        await con.close();
      }
    });
  });
} else {
  test.skip("postgis ext not available: skipping postgis tests", () => {
    // dummy test to satisfy jest
  });
}
