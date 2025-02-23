import { KNOWN_TYPENAMES } from "../src/codecs/consts";
import { NOOP_CODEC_CONTEXT } from "../src/codecs/context";
import {
  DateTimeCodec,
  DurationCodec,
  LocalDateTimeCodec,
  LocalTimeCodec,
} from "../src/codecs/datetime";
import { Duration, LocalDateTime, LocalTime } from "../src/index.shared";
import { ReadBuffer, WriteBuffer } from "../src/primitives/buffer";

// Gel date/time types have microsecond precision.
// JS Date has millisecond precision, Temporal types have nanosecond.
// When converting from micro -> milli, or nano -> micro, round to nearest even
// should be used.

// Tests adapted from https://github.com/geldata/gel-rust/blob/master/gel-protocol/tests/datetime_chrono.rs

test("datetime", () => {
  const codec = new DateTimeCodec(
    KNOWN_TYPENAMES.get("std::datetime")!,
    "std::datetime",
  );

  const tests: [string, string][] = [
    ["252455615999999999", "+010000-01-01T00:00:00.000Z"], // maximum
    ["-63082281600000000", "0001-01-01T00:00:00.000Z"], // minimum
    ["-5863791476995500", "1814-03-09T01:02:03.004Z"], // negative unix timestamp, round up
    ["-5863791476995501", "1814-03-09T01:02:03.004Z"], // negative unix timestamp, 5501
    ["-5863791476995499", "1814-03-09T01:02:03.005Z"], // negative unix timestamp, 5499
    ["-4523554676994500", "1856-08-27T01:02:03.006Z"], // negative unix timestamp, round down
    ["-4523554676994501", "1856-08-27T01:02:03.005Z"], // negative unix timestamp, 4501
    ["-4523554676994499", "1856-08-27T01:02:03.006Z"], // negative unix timestamp, 4499
    ["-946684800000500", "1970-01-01T00:00:00.000Z"], // unix timestamp to zero
    ["-78620276991500", "1997-07-05T01:02:03.008Z"], // negative postgres timestamp, round up
    ["-78620276991501", "1997-07-05T01:02:03.008Z"], // negative postgres timestamp, 501
    ["-78620276991499", "1997-07-05T01:02:03.009Z"], // negative postgres timestamp, 499
    ["-78620276994500", "1997-07-05T01:02:03.006Z"], // negative postgres timestamp, round down
    ["-78620276994501", "1997-07-05T01:02:03.005Z"], // negative postgres timestamp, 501
    ["-78620276994499", "1997-07-05T01:02:03.006Z"], // negative postgres timestamp, 499
    ["0", "2000-01-01T00:00:00.000Z"], // postgres timestamp to zero
    ["446774400001500", "2014-02-27T00:00:00.002Z"], // positive timestamp, round up
    ["446774400001501", "2014-02-27T00:00:00.002Z"], // positive timestamp, 1501
    ["446774400001499", "2014-02-27T00:00:00.001Z"], // positive timestamp, 1499
    ["698996583002500", "2022-02-24T05:43:03.002Z"], // positive timestamp, round down
    ["698996583002501", "2022-02-24T05:43:03.003Z"], // positive timestamp, 2501
    ["698996583002499", "2022-02-24T05:43:03.002Z"], // positive timestamp, 2499
  ];

  for (const [micros, datestring] of tests) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(micros));
    const datetime = codec.decode(
      new ReadBuffer(buf),
      NOOP_CODEC_CONTEXT,
    ) as Date;

    expect(datetime.toISOString()).toEqual(datestring);
  }
});

test("local_datetime", () => {
  const codec = new LocalDateTimeCodec(
    KNOWN_TYPENAMES.get("cal::local_datetime")!,
    "cal::local_datetime",
  );

  const tests: [string, string, string][] = [
    [
      "9999-12-31T23:59:59.999999499",
      "252455615999999999",
      "9999-12-31T23:59:59.999999",
    ], // maximum
    [
      "0001-01-01T00:00:00.000000000",
      "-63082281600000000",
      "0001-01-01T00:00:00",
    ], // minimum
    [
      "1814-03-09T01:02:03.000005500",
      "-5863791476999994",
      "1814-03-09T01:02:03.000006",
    ], // "negative unix timestamp, round up"
    [
      "1814-03-09T01:02:03.000005501",
      "-5863791476999994",
      "1814-03-09T01:02:03.000006",
    ], // "negative unix timestamp, 5501"
    [
      "1814-03-09T01:02:03.000005499",
      "-5863791476999995",
      "1814-03-09T01:02:03.000005",
    ], // "negative unix timestamp, 5499"
    [
      "1856-08-27T01:02:03.000004500",
      "-4523554676999996",
      "1856-08-27T01:02:03.000004",
    ], // "negative unix timestamp, round down"
    [
      "1856-08-27T01:02:03.000004501",
      "-4523554676999995",
      "1856-08-27T01:02:03.000005",
    ], // "negative unix timestamp, 4501"
    [
      "1856-08-27T01:02:03.000004499",
      "-4523554676999996",
      "1856-08-27T01:02:03.000004",
    ], // "negative unix timestamp, 4499"
    [
      "1969-12-31T23:59:59.999999500",
      "-946684800000000",
      "1970-01-01T00:00:00",
    ], // "unix timestamp to zero"
    [
      "1997-07-05T01:02:03.000009500",
      "-78620276999990",
      "1997-07-05T01:02:03.00001",
    ], // "negative postgres timestamp, round up"
    [
      "1997-07-05T01:02:03.000009500",
      "-78620276999990",
      "1997-07-05T01:02:03.00001",
    ], // "negative postgres timestamp, 9501"
    [
      "1997-07-05T01:02:03.000009499",
      "-78620276999991",
      "1997-07-05T01:02:03.000009",
    ], // "negative postgres timestamp, 9499"
    ["1997-07-05T01:02:03.000000500", "-78620277000000", "1997-07-05T01:02:03"], // "negative postgres timestamp, round down"
    [
      "1997-07-05T01:02:03.000000501",
      "-78620276999999",
      "1997-07-05T01:02:03.000001",
    ], // "negative postgres timestamp, 501"
    ["1997-07-05T01:02:03.000000499", "-78620277000000", "1997-07-05T01:02:03"], // "negative postgres timestamp, 499"
    ["1999-12-31T23:59:59.999999500", "0", "2000-01-01T00:00:00"], // "postgres timestamp to zero"
    [
      "2014-02-27T00:00:00.000001500",
      "446774400000002",
      "2014-02-27T00:00:00.000002",
    ], // "positive timestamp, round up"
    [
      "2014-02-27T00:00:00.000001501",
      "446774400000002",
      "2014-02-27T00:00:00.000002",
    ], // "positive timestamp, 1501"
    [
      "2014-02-27T00:00:00.000001499",
      "446774400000001",
      "2014-02-27T00:00:00.000001",
    ], // "positive timestamp, 1499"
    [
      "2022-02-24T05:43:03.000002500",
      "698996583000002",
      "2022-02-24T05:43:03.000002",
    ], // "positive timestamp, round down"
    [
      "2022-02-24T05:43:03.000002501",
      "698996583000003",
      "2022-02-24T05:43:03.000003",
    ], // "positive timestamp, 2501"
    [
      "2022-02-24T05:43:03.000002499",
      "698996583000002",
      "2022-02-24T05:43:03.000002",
    ], // "positive timestamp, 2499"
  ];

  for (const [inputDatestring, micros, outputDatestring] of tests) {
    const localDatetime = new LocalDateTime(
      // @ts-ignore
      ...inputDatestring
        .match(
          /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).(\d{3})(\d{3})(\d{3})/,
        )!
        .slice(1)
        .map((n) => parseInt(n, 10)),
    );
    const buf = new WriteBuffer();
    codec.encode(buf, localDatetime, NOOP_CODEC_CONTEXT);
    const encodedMicros = Buffer.from(buf.unwrap()).readBigInt64BE(4);

    expect(encodedMicros).toEqual(BigInt(micros));

    const readBuf = new ReadBuffer(buf.unwrap().slice(4));
    const decodedLocalDatetime = codec.decode(readBuf, NOOP_CODEC_CONTEXT);
    expect(decodedLocalDatetime.toString()).toBe(outputDatestring);
  }
});

test("local_time", () => {
  const codec = new LocalTimeCodec(
    KNOWN_TYPENAMES.get("cal::local_time")!,
    "cal::local_time",
  );

  const tests: [string, string][] = [
    ["00:00:00.000000000", "0"], // minimum
    ["23:59:59.999999000", "86399999999"], // maximum
    ["01:02:03.000005500", "3723000006"], // round up
    ["01:02:03.000005501", "3723000006"], // 5501
    ["01:02:03.000005499", "3723000005"], // 5499
    ["01:02:03.000004500", "3723000004"], // round down
    ["01:02:03.000004501", "3723000005"], // 4501
    ["01:02:03.000004499", "3723000004"], // 4499
  ];

  for (const [datestring, micros] of tests) {
    const localDatetime = new LocalTime(
      // @ts-ignore
      ...datestring
        .match(/(\d{2}):(\d{2}):(\d{2}).(\d{3})(\d{3})(\d{3})/)!
        .slice(1)
        .map((n) => parseInt(n, 10)),
    );
    const buf = new WriteBuffer();
    codec.encode(buf, localDatetime, NOOP_CODEC_CONTEXT);
    const encodedMicros = Buffer.from(buf.unwrap()).readBigInt64BE(4);

    expect(encodedMicros).toEqual(BigInt(micros));
  }
});

test("duration", () => {
  const codec = new DurationCodec(
    KNOWN_TYPENAMES.get("std::duration")!,
    "std::duration",
  );

  const tests: [string, string][] = [
    ["PT0S", "0"], // "Zero"
    ["PT1234.567890123S", "1234567890"], // "Some value"
    ["PT1.000002500S", "1000002"], // "round down"
    ["PT23.000002499S", "23000002"], // "2499 nanos"
    ["PT456.000002501S", "456000003"], // "2501 nanos"
    ["PT5789.000003500S", "5789000004"], // "round up"
    ["PT12345.000003499S", "12345000003"], // "3499 nanos"
    ["PT789012.000003501S", "789012000004"], // "3501 nanos"
    ["-PT1234.567890123S", "-1234567890"], // "Some value"
    ["-PT1.000002500S", "-1000002"], // "round down"
    ["-PT23.000002499S", "-23000002"], // "2499 nanos"
    ["-PT456.000002501S", "-456000003"], // "2501 nanos"
    ["-PT5789.000003500S", "-5789000004"], // "round up"
    ["-PT12345.000003499S", "-12345000003"], // "3499 nanos"
    ["-PT789012.000003501S", "-789012000004"], // "3501 nanos"
  ];

  for (const [durationString, micros] of tests) {
    const duration = Duration.from(durationString);
    const buf = new WriteBuffer();
    codec.encode(buf, duration, NOOP_CODEC_CONTEXT);
    const encodedMicros = Buffer.from(buf.unwrap()).readBigInt64BE(4);

    expect(encodedMicros).toEqual(BigInt(micros));
  }
});
