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

import { InternalClientError } from "../errors";

class Node<K, V> {
  public key: K;
  public value: V;
  public next: Node<K, V> | null;
  public prev: Node<K, V> | null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
    this.next = null;
    this.prev = null;
  }
}

class Deque<K, V> {
  public head: Node<K, V> | null;
  public tail: Node<K, V> | null;
  public len: number;

  /*
    Stack structure:

    ---~* top *~---

          +------+
   null --< prev |
          | next >--+
          +-^----+  |
            |       |
        +---+  +----+
        |      |
        | +----v-+
        +-< prev |
          | next >--+
          +-^----+  |
            |       |
        +---+  +----+
        |      |
        | +----v-+
        +-< prev |
          | next >-- null
          +------+

    ---~* bottom *~---
  */

  constructor() {
    this.head = null;
    this.tail = null;
    this.len = 0;
  }

  get length(): number {
    return this.len;
  }

  push(key: K, value: V): Node<K, V> {
    const node = new Node(key, value);
    if (this.head == null) {
      this.head = node;
      this.tail = node;
    } else {
      this.head.prev = node;
      node.next = this.head;
      this.head = node;
    }
    this.len++;
    return node;
  }

  moveToTop(node: Node<K, V>): void {
    if (node.prev == null) {
      // Already on top of the stack, do nothing.
      return;
    }

    const prev = node.prev;
    const next = node.next;

    // First, remove the node from the deque.

    prev.next = next;
    if (next != null) {
      next.prev = prev;
    }

    if (this.tail === node) {
      this.tail = prev;
    }

    // Second, push on top of the deque.

    node.prev = null;
    node.next = this.head;

    this.head!.prev = node;
    this.head = node;
  }

  deleteBottom(): Node<K, V> | null {
    if (!this.len || !this.tail || !this.head) {
      // Empty deque.
      return null;
    }

    if (this.tail === this.head) {
      this.len = 0;
      const node = this.tail;
      this.tail = null;
      this.head = null;
      return node;
    }

    const tail = this.tail;
    const beforeLast = this.tail.prev!;
    beforeLast.next = null;
    this.tail.prev = null;
    this.tail.next = null;
    this.tail = beforeLast;
    this.len--;
    return tail;
  }
}

interface LRUOptions {
  capacity: number;
}

export default class LRU<K, V> {
  private capacity: number;
  private map: Map<K, Node<K, V>>;
  private deque: Deque<K, V>;

  constructor({ capacity }: LRUOptions) {
    if (capacity <= 0) {
      throw new TypeError("capacity is expected to be greater than 0");
    }
    this.capacity = capacity;
    this.map = new Map();
    this.deque = new Deque();
  }

  get length(): number {
    const len = this.map.size;
    if (len !== this.deque.length) {
      // This check will be handy in tests
      // to ensure that our deque is in sync
      // with the map.
      throw new InternalClientError("deque & map disagree on elements count");
    }
    return len;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node != null) {
      this.deque.moveToTop(node);
      return node.value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    const existingNode = this.map.get(key);

    if (existingNode != null) {
      existingNode.value = value;
      this.deque.moveToTop(existingNode);
    } else {
      const newNode = this.deque.push(key, value);
      this.map.set(key, newNode);

      while (this.deque.length > this.capacity) {
        const bottomNode = this.deque.deleteBottom()!;
        this.map.delete(bottomNode.key);
      }
    }
  }

  *keys(): IterableIterator<K> {
    let node = this.deque.head;
    while (node != null) {
      yield node.key;
      node = node.next;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    let node = this.deque.head;
    while (node != null) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  *values(): IterableIterator<V> {
    let node = this.deque.head;
    while (node != null) {
      yield node.value;
      node = node.next;
    }
  }
}
