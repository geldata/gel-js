/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2021-present MagicStack Inc. and the Gel authors.
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

type Resolver<T> = (value: T | PromiseLike<T>) => void;
type Rejector = (reason: any) => void;

export default class Event {
  private _promise: Promise<boolean>;
  private _resolve: Resolver<boolean>;
  private _reject: Rejector;
  private _done: boolean;

  async wait(): Promise<void> {
    await this._promise;
  }

  /** @internal */
  then(..._args: any[]): any {
    // The mere presense of this method will trip TS if one awaits on
    // an Event object directly.
    throw new InternalClientError(
      "Event objects cannot be awaited on directly; use Event.wait()",
    );
  }

  get done(): boolean {
    return this._done;
  }

  set(): void {
    if (this._done) {
      throw new InternalClientError("emit(): the Event is already set");
    }
    this._resolve(true);
  }

  setError(reason: any): void {
    if (this._done) {
      throw new InternalClientError("emitError(): the Event is already set");
    }
    this._reject(reason);
  }

  constructor() {
    this._done = false;

    let futReject: Rejector | null = null;
    let futResolve: Resolver<boolean> | null = null;

    this._promise = new Promise<boolean>((resolve, reject) => {
      futReject = (reason) => {
        this._done = true;
        reject(reason);
      };

      futResolve = (value) => {
        this._done = true;
        resolve(value);
      };
    });

    if (!futReject || !futResolve) {
      // Impossible per the spec.
      throw new InternalClientError(
        "Promise executor was not called synchronously",
      );
    }

    this._reject = futReject;
    this._resolve = futResolve;
  }
}
