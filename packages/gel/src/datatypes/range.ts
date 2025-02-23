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

import type { Duration, LocalDate, LocalDateTime } from "./datetime";

export class Range<
  T extends number | Date | LocalDate | LocalDateTime | Duration,
> {
  private _isEmpty = false;

  constructor(
    private readonly _lower: T | null,
    private readonly _upper: T | null,
    private readonly _incLower: boolean = _lower != null,
    private readonly _incUpper = false,
  ) {}

  get lower() {
    return this._lower;
  }
  get upper() {
    return this._upper;
  }
  get incLower() {
    return this._incLower;
  }
  get incUpper() {
    return this._incUpper;
  }
  get isEmpty() {
    return this._isEmpty;
  }

  static empty() {
    const range = new Range(null, null);
    range._isEmpty = true;
    return range;
  }

  toJSON() {
    return this.isEmpty
      ? { empty: true }
      : {
          lower: this._lower,
          upper: this._upper,
          inc_lower: this._incLower,
          inc_upper: this._incUpper,
        };
  }
}

export class MultiRange<
  T extends number | Date | LocalDate | LocalDateTime | Duration,
> {
  private readonly _ranges: Range<T>[];
  constructor(ranges: Range<T>[] = []) {
    this._ranges = [...ranges];
  }

  get length() {
    return this._ranges.length;
  }

  *[Symbol.iterator]() {
    for (const range of this._ranges) {
      yield range;
    }
  }

  toJSON() {
    return [...this._ranges];
  }
}
