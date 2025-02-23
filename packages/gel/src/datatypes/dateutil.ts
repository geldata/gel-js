/*!
 * Portions Copyright (c) 2019 MagicStack Inc. and the Gel authors.
 * Portions Copyright (c) 2001-2019 Python Software Foundation.
 * All rights reserved.
 * Licence: PSFL https://docs.python.org/3/license.html
 */

// The following code was adapted from `CPython/lib/datetime.py`:
// https://github.com/python/cpython/blob/3.7/Lib/datetime.py

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return _DAYS_IN_MONTH[month];
}

function daysBeforeYear(year: number): number {
  const y = year - 1;
  return (
    y * 365 + Math.trunc(y / 4) - Math.trunc(y / 100) + Math.trunc(y / 400)
  );
}

export function daysBeforeMonth(year: number, month: number): number {
  return _DAYS_BEFORE_MONTH[month] + (month > 2 && isLeapYear(year) ? 1 : 0);
}

const _DI400Y = daysBeforeYear(401); // number of days in 400 years
const _DI100Y = daysBeforeYear(101); //    "    "   "   " 100   "
const _DI4Y = daysBeforeYear(5); //        "    "   "   "   4   "

const _DAYS_IN_MONTH = [-1, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const _DAYS_BEFORE_MONTH = (() => {
  const dbf = [-1];
  let dbm = 0;
  for (let i = 1; i < _DAYS_IN_MONTH.length; i++) {
    const dim = _DAYS_IN_MONTH[i];
    dbf.push(dbm);
    dbm += dim;
  }
  return dbf;
})();

export function ymd2ord(year: number, month: number, day: number): number {
  return daysBeforeYear(year) + daysBeforeMonth(year, month) + day;
}

function divmod(dividend: number, divisor: number): [number, number] {
  const quotient = Math.floor(dividend / divisor);
  return [quotient, dividend - divisor * quotient];
}

export function ord2ymd(n: number): [number, number, number] {
  /* ordinal -> (year, month, day), considering 01-Jan-0001 as day 1. */

  // n is a 1-based index, starting at 1-Jan-1.  The pattern of leap years
  // repeats exactly every 400 years.  The basic strategy is to find the
  // closest 400-year boundary at or before n, then work with the offset
  // from that boundary to n.  Life is much clearer if we subtract 1 from
  // n first -- then the values of n at 400-year boundaries are exactly
  // those divisible by _DI400Y:
  //
  //     D  M   Y            n              n-1
  //     -- --- ----        ----------     ----------------
  //     31 Dec -400        -_DI400Y       -_DI400Y -1
  //      1 Jan -399         -_DI400Y +1   -_DI400Y      400-year boundary
  //     ...
  //     30 Dec  000        -1             -2
  //     31 Dec  000         0             -1
  //      1 Jan  001         1              0            400-year boundary
  //      2 Jan  001         2              1
  //      3 Jan  001         3              2
  //     ...
  //     31 Dec  400         _DI400Y        _DI400Y -1
  //      1 Jan  401         _DI400Y +1     _DI400Y      400-year boundary
  n--;
  let n400: number;
  [n400, n] = divmod(n, _DI400Y);

  let year = n400 * 400 + 1; // ..., -399, 1, 401, ...

  // Now n is the (non-negative) offset, in days, from January 1 of year, to
  // the desired date.  Now compute how many 100-year cycles precede n.
  // Note that it's possible for n100 to equal 4!  In that case 4 full
  // 100-year cycles precede the desired day, which implies the desired
  // day is December 31 at the end of a 400-year cycle.
  let n100: number;
  [n100, n] = divmod(n, _DI100Y);

  // Now compute how many 4-year cycles precede it.
  let n4: number;
  [n4, n] = divmod(n, _DI4Y);

  // And now how many single years.  Again n1 can be 4, and again meaning
  // that the desired day is December 31 at the end of the 4-year cycle.
  let n1: number;
  [n1, n] = divmod(n, 365);

  year += n100 * 100 + n4 * 4 + n1;
  if (n1 === 4 || n100 === 4) {
    return [year - 1, 12, 31];
  }

  // Now the year is correct, and n is the offset from January 1.  We find
  // the month via an estimate that's either exact or one too large.
  const leapyear = n1 === 3 && (n4 !== 24 || n100 === 3);
  let month = (n + 50) >> 5;
  let preceding = _DAYS_BEFORE_MONTH[month] + (month > 2 && leapyear ? 1 : 0);
  if (preceding > n) {
    // estimate is too large
    month -= 1;
    preceding -= _DAYS_IN_MONTH[month] + (month === 2 && leapyear ? 1 : 0);
  }
  n -= preceding;

  // Now the year and month are correct, and n is the offset from the
  // start of that month:  we're done!
  return [year, month, n + 1];
}
