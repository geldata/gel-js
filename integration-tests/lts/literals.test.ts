import assert from "node:assert/strict";
import * as gel from "gel";
import { TypeKind } from "gel/dist/reflection";
import e from "./dbschema/edgeql-js";
import { setupTests, versionGTE } from "./setupTeardown";

describe("literals", () => {
  test("literals", () => {
    const duration = new gel.Duration(0, 0, 0, 0, 5, 6, 7, 8, 9, 10);
    const localdate = new gel.LocalDate(2021, 10, 31);
    const localdatetime = new gel.LocalDateTime(2021, 10, 31, 21, 45, 30);
    const localtime = new gel.LocalTime(15, 15, 0);
    const relduration = new gel.RelativeDuration(1, 2, 3);
    const dateduration = new gel.DateDuration(1, 2, 3, 4);
    const uuid = "317fee4c-0da5-45aa-9980-fedac211bfb6";

    assert.equal(
      e.std.bigint(BigInt("9007199254740991")).toEdgeQL(),
      `<std::bigint>9007199254740991n`,
    );
    assert.equal(e.std.bool(true).toEdgeQL(), `true`);
    assert.deepEqual(
      e.std.bytes(Buffer.from(`whatever\nðñòóôõö÷øùúûüýþÿ`)).toEdgeQL(),
      `b'whatever\\n\\xc3\\xb0\\xc3\\xb1\\xc3\\xb2\\xc3\\xb3\\xc3\\xb4\\xc3` +
        `\\xb5\\xc3\\xb6\\xc3\\xb7\\xc3\\xb8\\xc3\\xb9\\xc3\\xba\\xc3\\xbb` +
        `\\xc3\\xbc\\xc3\\xbd\\xc3\\xbe\\xc3\\xbf'`,
    );
    assert.equal(
      e.std.datetime(new Date("2021-06-25T02:01:13.681Z")).toEdgeQL(),
      `<std::datetime>'2021-06-25T02:01:13.681Z'`,
    );
    assert.equal(
      e.std.decimal("1234.1234n").toEdgeQL(),
      `<std::decimal>"1234.1234n"`,
    );
    assert.equal(
      e.std.duration(duration).toEdgeQL(),
      `<std::duration>'PT5H6M7.00800901S'`,
    );
    assert.equal(e.std.int16(144.1235).toEdgeQL(), `<std::int16>144.1235`);
    assert.equal(e.std.int64(1234.15).toEdgeQL(), `<std::int64>1234.15`);
    assert.equal(
      e.std.float64(1234.1234).toEdgeQL(),
      `<std::float64>1234.1234`,
    );
    assert.equal(e.std.float64(124).toEdgeQL(), `<std::float64>124`);
    assert.equal(
      e.std.int16("9223372036854775807").toEdgeQL(),
      `<std::int16>9223372036854775807`,
    );
    assert.equal(e.year("1234").toEdgeQL(), `<default::year>1234`);

    assert.equal(
      e.std.json("asdf$$$*").toEdgeQL(),
      `to_json($jsonliteral$"asdf$$$*"$jsonliteral$)`,
    );
    assert.equal(
      e.std.json({ a: 123, b: "some string", c: [true, false] }).toEdgeQL(),
      'to_json($jsonliteral${"a":123,"b":"some string","c":[true,false]}$jsonliteral$)',
    );

    assert.equal(e.std.str(`asdfaf`).toEdgeQL(), `"asdfaf"`);
    assert.equal(
      e.std.str(`string " with ' all \` quotes`).toEdgeQL(),
      `"string \\" with ' all \` quotes"`,
    );
    assert.equal(
      e.std.uuid(uuid).toEdgeQL(),
      `<std::uuid>"317fee4c-0da5-45aa-9980-fedac211bfb6"`,
    );

    if (versionGTE(6)) {
      assert.equal(
        e.cal.local_date(localdate).toEdgeQL(),
        `<std::cal::local_date>'2021-10-31'`,
      );
      assert.equal(
        e.cal.local_datetime(localdatetime).toEdgeQL(),
        `<std::cal::local_datetime>'2021-10-31T21:45:30'`,
      );
      assert.equal(
        e.cal.local_time(localtime).toEdgeQL(),
        `<std::cal::local_time>'15:15:00'`,
      );
      assert.equal(
        e.cal.relative_duration(relduration).toEdgeQL(),
        `<std::cal::relative_duration>'P1Y2M21D'`,
      );
      assert.equal(
        e.cal.date_duration(dateduration).toEdgeQL(),
        `<std::cal::date_duration>'P1Y2M25D'`,
      );
    } else {
      assert.equal(
        e.cal.local_date(localdate).toEdgeQL(),
        `<cal::local_date>'2021-10-31'`,
      );
      assert.equal(
        e.cal.local_datetime(localdatetime).toEdgeQL(),
        `<cal::local_datetime>'2021-10-31T21:45:30'`,
      );
      assert.equal(
        e.cal.local_time(localtime).toEdgeQL(),
        `<cal::local_time>'15:15:00'`,
      );
      assert.equal(
        e.cal.relative_duration(relduration).toEdgeQL(),
        `<cal::relative_duration>'P1Y2M21D'`,
      );
      assert.equal(
        e.cal.date_duration(dateduration).toEdgeQL(),
        `<cal::date_duration>'P1Y2M25D'`,
      );
    }
  });

  test("collection type literals", () => {
    const literalArray = e.literal(e.array(e.str), ["adsf"]);
    assert.equal(literalArray.toEdgeQL(), `["adsf"]`);
    const literalNamedTuple = e.literal(e.tuple({ str: e.str }), {
      str: "asdf",
    });
    assert.equal(literalNamedTuple.toEdgeQL(), `( str := "asdf" )`);
    const literalTuple = e.literal(e.tuple([e.str, e.int64]), ["asdf", 1234]);
    assert.equal(literalTuple.toEdgeQL(), `( "asdf", <std::int64>1234 )`);
  });

  test("enum literals", () => {
    const horror = e.Genre.Horror;
    assert.deepEqual(e.Genre.Horror.__element__.__kind__, TypeKind.enum);
    assert.deepEqual(horror.__element__, e.Genre);
    assert.deepEqual(horror.__cardinality__, gel.$.Cardinality.One);
    assert.equal(
      e.literal(e.Genre, "Horror").toEdgeQL(),
      `default::Genre.Horror`,
    );

    assert.ok(e.Genre.__values__.includes("Horror"));

    assert.throws(() => (e.Genre as any).NotAGenre.toEdgeQL());
    assert.throws(() => e.literal(e.Genre, "NotAGenre" as "Horror").toEdgeQL());
  });

  test("constructing with strings", async () => {
    const { client } = await setupTests();

    const dateString = new Date().toISOString();
    assert.deepEqual(
      (await e.datetime(dateString).run(client)).toISOString(),
      dateString,
    );

    await e.int64("12341234").run(client);
    await e.cal.local_datetime("1999-03-31T15:17:00").run(client);
    await e.cal.local_date("1999-03-31").run(client);
    await e.cal.local_time("15:17:00").run(client);
    await e.duration("5 hours").run(client);
    await e.cal.relative_duration("4 weeks 5 hours").run(client);
    await e.cal.date_duration("4 months 5 days").run(client);
  });
});
