import assert from "node:assert/strict";
import * as gel from "gel";
import e from "./dbschema/edgeql-js";
import type { getSharedParentPrimitiveVariadic } from "./dbschema/edgeql-js/syntax";
import { setupTests, tc, teardownTests } from "./setupTeardown";

describe("primitives", () => {
  let client: gel.Client;
  beforeAll(async () => {
    const setup = await setupTests();
    ({ client } = setup);
  });

  afterAll(async () => {
    await teardownTests(client);
  });

  test("primitive types", () => {
    assert.equal(e.int16.__name__, "std::int16");
    assert.equal(e.int32.__name__, "std::int32");
    assert.equal(e.int64.__name__, "std::int64");
    assert.equal(e.float32.__name__, "std::float32");
    assert.equal(e.float64.__name__, "std::float64");
    assert.equal(e.str.__name__, "std::str");
  });

  test("collection types", () => {
    const arrayType = e.array(e.str);
    assert.equal(arrayType.__name__, "array<std::str>");
    const named = e.tuple({ str: e.str });
    assert.equal(named.__name__, "tuple<str: std::str>");
    assert.equal(named.__shape__.str.__name__, "std::str");
    const unnamed = e.tuple([e.str, e.int64]);
    assert.equal(unnamed.__name__, "tuple<std::str, std::int64>");
    assert.equal(unnamed.__items__[0].__name__, "std::str");
    assert.equal(unnamed.__items__[1].__name__, "std::int64");
  });

  test("scalar type merging", () => {
    type _t1 = getSharedParentPrimitiveVariadic<
      [typeof e.std.str, typeof e.std.str]
    >;
    tc.assert<tc.IsExact<_t1, typeof e.std.str>>(true);
    type _t2 = getSharedParentPrimitiveVariadic<
      [typeof e.std.str, typeof e.std.int32]
    >;
    tc.assert<tc.IsExact<_t2, never>>(true);
  });

  test("range primitives", async () => {
    const range = new gel.Range(3, 8);
    const lowerRange = new gel.Range(3, null);
    const upperRange = new gel.Range(null, 8);
    const dateRange = new gel.Range(
      new Date("2022-07-05T14:00:00Z"),
      new Date("2022-07-05T16:00:00Z"),
    );

    assert.equal(
      e.std.range(range).toEdgeQL(),
      `std::range(3, 8, inc_lower := true, inc_upper := false)`,
    );
    assert.equal(
      e.std.range(lowerRange).toEdgeQL(),
      `std::range(3, <std::int64>{}, inc_lower := true, inc_upper := false)`,
    );
    assert.equal(
      e.std.range(upperRange).toEdgeQL(),
      `std::range(<std::int64>{}, 8, inc_lower := false, inc_upper := false)`,
    );
    assert.equal(
      e.std.range(dateRange).toEdgeQL(),
      `std::range(<std::datetime>'2022-07-05T14:00:00.000Z', <std::datetime>'2022-07-05T16:00:00.000Z', inc_lower := true, inc_upper := false)`,
    );

    assert.equal(e.range(3, 8).toEdgeQL(), `std::range(3, 8)`);
    assert.equal(e.range(3).toEdgeQL(), `std::range(3)`);
    assert.equal(
      e.range(undefined, 8).toEdgeQL(),
      `std::range(<std::float64>{}, 8)`,
    );

    assert.throws(() => e.range(new gel.Range(null, null)));
    assert.throws(() => e.range(gel.Range.empty()));

    const res = await e
      .select({
        range: e.range(range),
        lowerRange: e.range(lowerRange),
        upperRange: e.range(upperRange),
        dateRange: e.range(dateRange),
      })
      .run(client);

    tc.assert<
      tc.IsExact<
        typeof res,
        {
          range: gel.Range<number>;
          lowerRange: gel.Range<number>;
          upperRange: gel.Range<number>;
          dateRange: gel.Range<Date>;
        }
      >
    >(true);

    assert.deepEqual(res, {
      range: range,
      lowerRange: lowerRange,
      upperRange: new gel.Range(null, 8, false),
      dateRange: dateRange,
    });

    const getLower = e.range_get_lower(e.Bag.rangeField);

    tc.assert<
      tc.IsExact<(typeof getLower)["__element__"]["__name__"], "std::number">
    >(true);
    assert.equal(getLower.__element__.__name__, "std::number");

    const q2 = e.params(
      {
        range: e.range(e.int32),
        rangeArray: e.array(e.range(e.datetime)),
      },
      ($) =>
        e.select({
          range: $.range,
          rangeArray: $.rangeArray,
        }),
    );

    const res2 = await q2.run(client, { range, rangeArray: [dateRange] });

    tc.assert<
      tc.IsExact<
        typeof res2,
        { range: gel.Range<number>; rangeArray: gel.Range<Date>[] }
      >
    >(true);

    assert.deepEqual(res2, { range: range, rangeArray: [dateRange] });

    await e
      .insert(e.Bag, {
        stringsMulti: "test",
        rangeField: range,
      })
      .run(client);

    await e
      .update(e.Bag, () => ({
        set: {
          rangeField: e.range(lowerRange),
        },
      }))
      .run(client);

    const res3 = await e.select(e.Bag.rangeField).run(client);

    tc.assert<tc.IsExact<typeof res3, gel.Range<number>[]>>(true);

    assert.deepEqual(res3, [lowerRange]);

    await e.delete(e.Bag).run(client);
  });

  test("enum value with space", async () => {
    const result = await e.Genre["Science Fiction"].run(client);
    assert.equal(result, "Science Fiction");
  });
});
