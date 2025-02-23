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

import LRU from "../src/primitives/lru";

test("invalid capacity", () => {
  expect(() => {
    // tslint:disable-next-line: no-unused-expression
    new LRU({ capacity: -1 });
  }).toThrowError(TypeError);
});

test("capacity=1", () => {
  const lru = new LRU<number, string>({ capacity: 1 });

  expect(lru.length).toBe(0);

  lru.set(1, "one");
  expect(lru.get(1)).toBe("one");
  expect(lru.has(1)).toBeTruthy();
  expect(lru.length).toBe(1);

  lru.set(1, "one?");
  expect(lru.get(1)).toBe("one?");
  expect(lru.has(1)).toBeTruthy();
  expect(lru.has(2)).toBeFalsy();
  expect(lru.length).toBe(1);

  lru.set(2, "two");
  expect(lru.has(1)).toBeFalsy();
  expect(lru.get(1)).toBeUndefined();
  expect(lru.has(2)).toBeTruthy();
  expect(lru.get(2)).toBe("two");
  expect(lru.length).toBe(1);
});

test("capacity=3", () => {
  const lru = new LRU<number, string>({ capacity: 3 });

  expect(lru.length).toBe(0);

  lru.set(1, "one");
  lru.set(1, "one?");
  lru.set(2, "two");
  lru.set(3, "three");
  lru.set(4, "four");

  expect(lru.length).toBe(3);
  expect(lru.get(1)).toBeUndefined();
  expect(lru.get(2)).toBe("two");
  expect(lru.get(3)).toBe("three");
  expect(lru.get(4)).toBe("four");

  lru.set(1, "one!");
  lru.set(4, "four?");
  lru.set(3, "three");

  expect(lru.get(2)).toBeUndefined();
  expect(lru.get(3)).toBe("three");
  expect(lru.get(1)).toBe("one!");
  expect(lru.get(4)).toBe("four?");

  expect(lru.length).toBe(3);
  expect(Array.from(lru.keys())).toEqual([4, 1, 3]);
  expect(Array.from(lru.entries())).toEqual([
    [4, "four?"],
    [1, "one!"],
    [3, "three"],
  ]);
});

test("fuzzed", () => {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const values = ["a", "b", "c", "d", "e", "f"];
  const lru = new LRU<number, string>({ capacity: 3 });

  function choice<T>(ar: T[]): T {
    return ar[Math.floor(Math.random() * ar.length)];
  }

  for (let i = 0; i < 1000; i++) {
    lru.set(choice(keys), choice(values));
    lru.get(choice(keys));
    Array.from(lru.keys());
  }

  expect(lru.length).toBe(3);
});
