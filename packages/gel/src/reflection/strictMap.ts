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

export class StrictMap<K, V> extends Map<K, V> {
  /* A version of `Map` with a `get` method that throws an
     error on missing keys instead of returning an undefined.
     This is easier to work with when everything is strictly typed.
  */
  override get(key: K): V {
    if (!this.has(key)) {
      throw new Error(`key "${key}" is not found`);
    }
    return super.get(key)!;
  }
}

export class StrictMapSet<K, V> extends StrictMap<K, Set<V>> {
  appendAt(key: K, value: V): void {
    const set = this.has(key) ? this.get(key) : new Set<V>();
    set.add(value);
    this.set(key, set);
  }
}
