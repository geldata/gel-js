/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2020-present MagicStack Inc. and the Gel authors.
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

import { LifoQueue } from "../src/primitives/queues";

test("LifoQueue `get` awaits for items in the queue", async () => {
  let result = -1;
  const queue = new LifoQueue<number>();

  setTimeout(() => {
    result = new Date().getTime();
    queue.push(result);
  }, 10);

  const value = await queue.get();

  expect(value).toBe(result);
  expect(value).toBeGreaterThan(-1);
});

test("LifoQueue resolves items in LIFO order", (done) => {
  let result1 = -1;
  let result2 = -1;
  let result3 = -1;
  const queue = new LifoQueue<number>();

  setTimeout(() => {
    result1 = new Date().getTime();
    queue.push(result1);
  }, 10);

  setTimeout(() => {
    result2 = new Date().getTime();
    queue.push(result2);
  }, 20);

  setTimeout(async () => {
    result3 = new Date().getTime();
    queue.push(result3);

    // Note: here queue.get() is called when items are in the queue.
    // Items are returned in LIFO order.
    const [value1, value2, value3] = await Promise.all([
      queue.get(),
      queue.get(),
      queue.get(),
    ]);

    expect(value1).toBe(result3);
    expect(value2).toBe(result2);
    expect(value3).toBe(result1);

    done();
  }, 30);
});

test("LifoQueue resolves `get` as soon as items are pushed", async () => {
  let result1 = -1;
  let result2 = -1;
  let result3 = -1;
  const queue = new LifoQueue<number>();

  setTimeout(() => {
    result1 = new Date().getTime();
    queue.push(result1);
  }, 10);

  setTimeout(() => {
    result2 = new Date().getTime();
    queue.push(result2);
  }, 20);

  setTimeout(() => {
    result3 = new Date().getTime();
    queue.push(result3);
  }, 30);

  const [value1, value2, value3] = await Promise.all([
    queue.get(),
    queue.get(),
    queue.get(),
  ]);

  // Note: here queue.get() is called in advance.
  // Since promises are resolved as soon as they become available,
  // the end result of Promise.all looks like FIFO.
  // This is right and cannot be changed: it depends on how the queue is used
  // in this specific case.
  expect(value1).toBe(result1);
  expect(value2).toBe(result2);
  expect(value3).toBe(result3);
});

test("LifoQueue returns first the last items in the queue", async () => {
  const queue = new LifoQueue<number>();

  queue.push(1);
  queue.push(2);
  queue.push(3);
  queue.push(4);
  queue.push(5);

  let value = await queue.get();
  expect(value).toBe(5);

  value = await queue.get();
  expect(value).toBe(4);

  queue.push(6);

  value = await queue.get();
  expect(value).toBe(6);
});

test("LifoQueue is clean when empty", async () => {
  const queue = new LifoQueue<number>();

  queue.push(1);
  queue.push(2);
  queue.push(3);

  expect(queue).toHaveLength(3);

  while (queue.length) {
    await queue.get();
  }

  expect(queue).toHaveLength(0);
});

test("LifoQueue length is the number of available items 1", async () => {
  let count = 200;
  const total = 200;
  const queue = new LifoQueue<number>();
  const promises: Array<Promise<number>> = [];

  for (const _ of new Array(count)) {
    // calling `get` simulates a consumer of the queue that will
    // await for something to become available, like an available db connection
    promises.push(queue.get());
  }

  expect(queue.length).toBe(-total);

  while (count) {
    count--;
    queue.push(count);
    expect(queue.length).toBe(count === 0 ? 0 : -count);
  }

  expect(queue).toHaveLength(0);

  const items = await Promise.all(promises);

  const expectedResult = Array.from(Array(total).keys()).reverse();
  expect(items).toEqual(expectedResult);
});

test("LifoQueue length is the number of available items 2", async () => {
  let count = 200;
  const total = 200;
  const queue = new LifoQueue<number>();
  const promises: Array<Promise<number>> = [];

  for (const item of Array.from(Array(total).keys())) {
    // [0, 1, 2, 3, ...
    queue.push(item);
    expect(queue.length).toBe(item + 1);
  }

  expect(queue.length).toBe(total);

  while (count) {
    count--;
    promises.push(queue.get());
    expect(queue.length).toBe(count);
  }

  expect(queue).toHaveLength(0);

  const items = await Promise.all(promises);

  const expectedResult = Array.from(Array(total).keys()).reverse();
  expect(items).toEqual(expectedResult);
});

test("LifoQueue length and pending", (done) => {
  const calls: string[] = [];
  const total = 20;
  const queue = new LifoQueue<number>();
  const promises: Array<Promise<number>> = [];

  // initialize the queue with a number of elements
  for (const item of Array.from(Array(total).keys())) {
    queue.push(item);
  }

  expect(queue.length).toBe(total);
  expect(queue.pending).toBe(0);

  // simulate a triple number of consumers (e.g. 3x incoming
  // requests needing a connection, compared to pool size)
  for (const _ of Array.from(Array(total * 3).keys())) {
    promises.push(queue.get());
  }

  // at this point, queue length is negative because there are more
  // consumers awaiting for items than available items
  expect(queue.length).toBe(total * -2);
  expect(queue.pending).toBe(total * 2);

  Promise.all(promises.slice(total * 2, total * 3)).then(() => {
    expect(queue).toHaveLength(0);
    expect(queue.pending).toBe(0);

    calls.push("C");
    expect(calls).toEqual(["A", "B", "C"]);

    done();
  });

  // note: consumers are satisfied in the same order as they arrived,
  Promise.all(promises.slice(total, total * 2)).then((values) => {
    expect(queue.length).toBe(-total);
    expect(queue.pending).toBe(total);

    calls.push("B");

    // put back the items on the queue; when all are put, the other promises
    // will be resolved
    for (const value of values) {
      queue.push(value);
    }
  });

  setTimeout(async () => {
    // the first 20 promises are already resolved because the queue
    // was initialized with 20 items (they would be also without timeout)
    const firstTwenty = await Promise.all(promises.slice(0, 20));

    const expectedResult = Array.from(Array(total).keys()).reverse();
    expect(firstTwenty).toEqual(expectedResult);

    // put pack the items on the queue (e.g. the first twenty consumers are
    // done)
    for (const value of firstTwenty) {
      queue.push(value);
    }

    calls.push("A");
  }, 20);
});

test("LifoQueue cancelAllPending", async () => {
  const queue = new LifoQueue<number>();
  const promises: Array<Promise<number>> = [];

  for (let i = 0; i < 20; i++) {
    promises.push(queue.get());
  }

  expect(queue.pending).toBe(20);

  for (let i = 0; i < 10; i++) {
    queue.push(i);
  }

  expect(queue.pending).toBe(10);

  const err = new Error("queue closing");

  queue.cancelAllPending(err);

  expect(queue.pending).toBe(0);

  for (const promise of promises.slice(0, 10)) {
    expect(typeof (await promise)).toBe("number");
  }

  for (const promise of promises.slice(10)) {
    await expect(promise).rejects.toThrow(err);
  }
});
