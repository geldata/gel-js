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

import { InternalClientError } from "../errors";

export class LifoQueue<T> {
  private _promises: Promise<T>[];
  private _resolvers: ((t: T) => void)[];
  private _rejecters: ((err: Error) => void)[];

  constructor() {
    this._resolvers = [];
    this._rejecters = [];
    this._promises = [];
  }

  private _add(): void {
    this._promises.push(
      new Promise((resolve: (item: T) => void, reject) => {
        this._resolvers.push(resolve);
        this._rejecters.push(reject);
      }),
    );
  }

  /**
   * Add an item to the queue.
   * If any consumer is awaiting for an item from the queue, the item is passed
   * to the first consumer in the queue.
   */
  push(item: T): void {
    if (!this._resolvers.length) {
      this._add();
    }
    const resolve = this._resolvers.shift();
    this._rejecters.shift();
    if (!resolve) {
      // can never happen
      throw new InternalClientError(
        "resolve function was null or undefined when attempting to push.",
      );
    }
    resolve(item);
  }

  /**
   * Return a promise that resolves with the last element in the queue.
   * If the queue is empty, the promise is resolved as soon as an item is
   * added to the queue.
   */
  get(): Promise<T> {
    if (!this._promises.length) {
      this._add();
    }
    const promise = this._promises.pop();
    if (!promise) {
      // can never happen
      throw new InternalClientError(
        "promise was null or undefined when attempting to get.",
      );
    }
    return promise;
  }

  cancelAllPending(err: Error): void {
    const rejecters = this._rejecters;
    this._rejecters = [];
    this._resolvers = [];
    for (const reject of rejecters) {
      reject(err);
    }
  }

  /**
   * Get the count of available elements in the queue.
   * This value can be negative, if the number of consumers awaiting for items
   * to become available is greater than the items in the queue.
   */
  get length(): number {
    return this._promises.length - this._resolvers.length;
  }

  /**
   * Get the count of consumers awaiting for items to become available in
   * the queue.
   */
  get pending(): number {
    return Math.max(0, this._resolvers.length - this._promises.length);
  }
}
