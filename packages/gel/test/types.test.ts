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

import { Temporal } from "@js-temporal/polyfill";
import {
  Duration,
  LocalDate,
  LocalDateFromOrdinal,
  LocalDateToOrdinal,
  LocalTime,
} from "../src/datatypes/datetime";

test("types: LocalDate", async () => {
  const ld = new LocalDate(2008, 1, 30);
  expect(ld.toString()).toBe("2008-01-30");
  expect(ld.year).toBe(2008);
  expect(ld.day).toBe(30);
  expect(ld.month).toBe(1);

  const temporalPlainDate: LocalDate = Temporal.PlainDate.from(ld);
  expect(ld.year).toBe(temporalPlainDate.year);
  expect(ld.month).toBe(temporalPlainDate.month);
  expect(ld.day).toBe(temporalPlainDate.day);

  for (const [y, m, d, n] of [
    [1, 1, 1, 1],
    [1, 12, 31, 365],
    [2, 1, 1, 366],
    [1945, 11, 12, 710347],
  ]) {
    const ld2 = new LocalDate(y, m, d);
    expect(LocalDateToOrdinal(ld2)).toBe(n);
    const fromord = LocalDateFromOrdinal(n);
    expect(ld2.toString()).toBe(fromord.toString());
    expect(LocalDateToOrdinal(ld2)).toBe(LocalDateToOrdinal(fromord));
  }

  expect(() => {
    return new LocalDate(2008, 13, 11);
  }).toThrow(/invalid month 13/);

  expect(() => {
    return new LocalDate(2008, 4, 31);
  }).toThrow(/invalid number of days 31.*1-30/);

  expect(() => {
    return new LocalDate(2008, 2, 31);
  }).toThrow(/invalid number of days 31.*1-29/);

  expect(() => {
    return new LocalDate(2009, 2, 31);
  }).toThrow(/invalid number of days 31.*1-28/);

  for (let i = 0; i < 5000; i++) {
    const year = Math.random() * 547579 - 271820;
    const month = Math.random() * 12 + 1;
    const day = Math.random() * (Math.floor(month) === 2 ? 28 : 30) + 1;

    const localDate = new LocalDate(year, month, day);
    const plainDate: LocalDate = new Temporal.PlainDate(year, month, day);

    expect(localDate.year).toBe(plainDate.year);
    expect(localDate.month).toBe(plainDate.month);
    expect(localDate.day).toBe(plainDate.day);
    expect(localDate.dayOfWeek).toBe(plainDate.dayOfWeek);
    expect(localDate.dayOfYear).toBe(plainDate.dayOfYear);
    // https://github.com/tc39/proposal-temporal/issues/1119
    // expect(localDate.weekOfYear).toBe(plainDate.weekOfYear);
    expect(localDate.daysInMonth).toBe(plainDate.daysInMonth);
    expect(localDate.daysInYear).toBe(plainDate.daysInYear);
    expect(localDate.monthsInYear).toBe(plainDate.monthsInYear);
    expect(localDate.inLeapYear).toBe(plainDate.inLeapYear);
    expect(localDate.toString()).toBe(plainDate.toString());
  }
});

test("types: LocalTime", async () => {
  for (let i = 0; i < 5000; i++) {
    const hour = Math.random() * 23 + 1;
    const minute = Math.random() * 59 + 1;
    const second = Math.random() * 59 + 1;
    const millisecond = Math.random() * 999 + 1;
    const microsecond = Math.random() * 999 + 1;
    const nanosecond = Math.random() * 999 + 1;

    const localTime = new LocalTime(
      hour,
      minute,
      second,
      millisecond,
      microsecond,
      nanosecond,
    );
    const plainTime: LocalTime = new Temporal.PlainTime(
      hour,
      minute,
      second,
      millisecond,
      microsecond,
      nanosecond,
    );

    expect(localTime.hour).toBe(plainTime.hour);
    expect(localTime.minute).toBe(plainTime.minute);
    expect(localTime.second).toBe(plainTime.second);
    expect(localTime.millisecond).toBe(plainTime.millisecond);
    expect(localTime.microsecond).toBe(plainTime.microsecond);
    expect(localTime.nanosecond).toBe(plainTime.nanosecond);
    expect(localTime.toString()).toBe(plainTime.toString());
  }
});

test("types: Duration", async () => {
  expect(
    new Duration(
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
      1234567890,
    ).toString(),
  ).toBe(
    "P1234567890Y1234567890M1234567890W1234567890DT1234567890H1234567890M1235803693.69245789S",
  );

  expect(new Duration(0, 0, 0, 0, 24).toString()).toBe("PT24H");

  for (let i = 0; i < 5000; i++) {
    const sign = Math.sign(Math.random() - 0.5);

    const args = Array(10)
      .fill(0)
      .map(() =>
        Math.round(
          Math.random() *
            (i < 100 ? Number.MAX_VALUE : Number.MAX_SAFE_INTEGER) *
            sign,
        ),
      );

    const duration = new Duration(...args);
    const temporalDuration: Duration = new Temporal.Duration(...args);

    expect(duration.years).toBe(temporalDuration.years);
    expect(duration.months).toBe(temporalDuration.months);
    expect(duration.weeks).toBe(temporalDuration.weeks);
    expect(duration.days).toBe(temporalDuration.days);
    expect(duration.hours).toBe(temporalDuration.hours);
    expect(duration.minutes).toBe(temporalDuration.minutes);
    expect(duration.seconds).toBe(temporalDuration.seconds);
    expect(duration.milliseconds).toBe(temporalDuration.milliseconds);
    expect(duration.microseconds).toBe(temporalDuration.microseconds);
    expect(duration.nanoseconds).toBe(temporalDuration.nanoseconds);
    expect(duration.sign).toBe(temporalDuration.sign);
    expect(duration.blank).toBe(temporalDuration.blank);
    expect(duration.toString()).toBe(temporalDuration.toString());
  }

  expect(() => Duration.from({})).toThrow(TypeError);
  expect(() => Temporal.Duration.from({})).toThrow(TypeError);
  for (const durationStr of [
    "",
    "P",
    "PT",
    "P3WT",
    "P3.5D",
    "P1.2Y",
    "P2.3M",
    "P3.4W",
    "PT1.2H3M",
    "PT1.2H3S",
    "PT1.2M5.6S",
    "PT-5M",
  ]) {
    expect(() => Duration.from(durationStr)).toThrow(RangeError);
    expect(() => Temporal.Duration.from(durationStr)).toThrow(RangeError);
  }

  for (const durationLike of [
    "PT0S",
    "Pt3.4H",
    "-pT5.2345M",
    "PT123.45678S",
    "P1Y2M3W4DT5h6m7s",
    "-P1Y2M3W4DT5h6m7s",
  ]) {
    const duration = Duration.from(durationLike);
    const temporalDuration = Temporal.Duration.from(durationLike);

    expect(duration.years).toBe(temporalDuration.years);
    expect(duration.months).toBe(temporalDuration.months);
    expect(duration.weeks).toBe(temporalDuration.weeks);
    expect(duration.days).toBe(temporalDuration.days);
    expect(duration.hours).toBe(temporalDuration.hours);
    expect(duration.minutes).toBe(temporalDuration.minutes);
    expect(duration.seconds).toBe(temporalDuration.seconds);
    expect(duration.milliseconds).toBe(temporalDuration.milliseconds);
    expect(duration.microseconds).toBe(temporalDuration.microseconds);
    expect(duration.nanoseconds).toBe(temporalDuration.nanoseconds);
    expect(duration.sign).toBe(temporalDuration.sign);
  }
});
