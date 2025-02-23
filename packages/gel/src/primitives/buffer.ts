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

import type char from "./chars";
import * as chars from "./chars";

export const utf8Encoder = new TextEncoder();
export const utf8Decoder = new TextDecoder("utf8");

let decodeB64: (_: string) => Uint8Array;
let encodeB64: (_: Uint8Array) => string;

if (typeof Buffer === "function") {
  decodeB64 = (b64: string): Uint8Array => {
    return Buffer.from(b64, "base64");
  };
  encodeB64 = (data: Uint8Array): string => {
    const buf = !Buffer.isBuffer(data)
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : data;
    return buf.toString("base64");
  };
} else {
  decodeB64 = (b64: string): Uint8Array => {
    const binaryString = atob(b64);
    const size = binaryString.length;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };
  encodeB64 = (data: Uint8Array): string => {
    const binaryString = String.fromCharCode(...data);
    return btoa(binaryString);
  };
}

export { decodeB64, encodeB64 };

/* WriteBuffer over-allocation */
const BUFFER_INC_SIZE = 4096;

const EMPTY_BUFFER = new Uint8Array(0);

export class BufferError extends Error {}

export class WriteBuffer {
  private _rawBuffer: Uint8Array;
  public buffer: DataView;
  private size: number;
  private pos: number;

  constructor() {
    this.size = BUFFER_INC_SIZE;
    this.pos = 0;
    this._rawBuffer = new Uint8Array(this.size);
    this.buffer = new DataView(this._rawBuffer.buffer);
  }

  get position(): number {
    return this.pos;
  }

  reset(): void {
    this.pos = 0;
  }

  private ensureAlloced(extraLength: number): void {
    const newSize: number = this.pos + extraLength;
    if (newSize > this.size) {
      this.__realloc(newSize);
    }
  }

  private __realloc(newSize: number): void {
    newSize += BUFFER_INC_SIZE;
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(this._rawBuffer);
    this._rawBuffer = newBuffer;
    this.buffer = new DataView(this._rawBuffer.buffer);
    this.size = newSize;
  }

  writeChar(ch: char): this {
    this.ensureAlloced(1);
    this.buffer.setUint8(this.pos, ch);
    this.pos++;
    return this;
  }

  writeString(s: string): this {
    return this.writeBytes(utf8Encoder.encode(s));
  }

  writeBytes(buf: Uint8Array): this {
    this.ensureAlloced(buf.length + 4);
    this.buffer.setInt32(this.pos, buf.length);
    this.pos += 4;
    this._rawBuffer.set(buf, this.pos);
    this.pos += buf.length;
    return this;
  }

  writeInt16(i: number): this {
    this.ensureAlloced(2);
    this.buffer.setInt16(this.pos, i);
    this.pos += 2;
    return this;
  }

  writeInt32(i: number): this {
    this.ensureAlloced(4);
    this.buffer.setInt32(this.pos, i);
    this.pos += 4;
    return this;
  }

  writeFloat32(i: number): this {
    this.ensureAlloced(4);
    this.buffer.setFloat32(this.pos, i);
    this.pos += 4;
    return this;
  }

  writeFloat64(i: number): this {
    this.ensureAlloced(8);
    this.buffer.setFloat64(this.pos, i);
    this.pos += 8;
    return this;
  }

  writeUInt8(i: number): this {
    this.ensureAlloced(1);
    this.buffer.setUint8(this.pos, i);
    this.pos += 1;
    return this;
  }

  writeUInt16(i: number): this {
    this.ensureAlloced(2);
    this.buffer.setUint16(this.pos, i);
    this.pos += 2;
    return this;
  }

  writeUInt32(i: number): this {
    this.ensureAlloced(4);
    this.buffer.setUint32(this.pos, i);
    this.pos += 4;
    return this;
  }

  writeInt64(i: number): this {
    this.ensureAlloced(8);
    const hi = Math.floor(i / 0x100000000);
    const lo = i - hi * 0x100000000;
    this.buffer.setInt32(this.pos, hi);
    this.buffer.setUint32(this.pos + 4, lo);
    this.pos += 8;
    return this;
  }

  writeBigInt64(i: bigint): this {
    let ii = i;
    if (ii < 0n) {
      ii = 18446744073709551616n + i;
    }
    const hi = ii >> 32n;
    const lo = ii & 0xffffffffn;
    this.writeUInt32(Number(hi));
    this.writeUInt32(Number(lo));
    return this;
  }

  writeBuffer(buf: Uint8Array): this {
    const len = buf.length;
    this.ensureAlloced(len);
    this._rawBuffer.set(buf, this.pos);
    this.pos += len;
    return this;
  }

  writeDeferredSize(): () => void {
    const startPos = this.pos;
    this.writeInt32(0);
    return () => {
      this.buffer.setInt32(startPos, this.pos - (startPos + 4));
    };
  }

  unwrap(): Uint8Array {
    return this._rawBuffer.subarray(0, this.pos);
  }
}

export class WriteMessageBuffer {
  private buffer: WriteBuffer;
  private messagePos: number;

  constructor() {
    this.messagePos = -1;
    this.buffer = new WriteBuffer();
  }

  reset(): this {
    this.messagePos = -1;
    this.buffer.reset();
    return this;
  }

  beginMessage(mtype: char): this {
    if (this.messagePos >= 0) {
      throw new BufferError(
        "cannot begin a new message: the previous message is not finished",
      );
    }
    this.messagePos = this.buffer.position;
    this.buffer.writeChar(mtype);
    this.buffer.writeInt32(0);
    return this;
  }

  endMessage(): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot end the message: no current message");
    }

    this.buffer.buffer.setInt32(
      this.messagePos + 1,
      this.buffer.position - this.messagePos - 1,
    );
    this.messagePos = -1;
    return this;
  }

  writeChar(ch: char): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeChar: no current message");
    }
    this.buffer.writeChar(ch);
    return this;
  }

  writeString(s: string): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeString: no current message");
    }
    this.buffer.writeString(s);
    return this;
  }

  writeBytes(val: Uint8Array): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeBytes: no current message");
    }
    this.buffer.writeBytes(val);
    return this;
  }

  writeInt16(i: number): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeInt16: no current message");
    }
    this.buffer.writeInt16(i);
    return this;
  }

  writeInt32(i: number): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeInt32: no current message");
    }
    this.buffer.writeInt32(i);
    return this;
  }

  writeUInt16(i: number): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeInt16: no current message");
    }
    this.buffer.writeUInt16(i);
    return this;
  }

  writeUInt32(i: number): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeInt32: no current message");
    }
    this.buffer.writeUInt32(i);
    return this;
  }

  writeBigInt64(i: bigint): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeChar: no current message");
    }
    this.buffer.writeBigInt64(i);
    return this;
  }

  writeFlags(h: number, l: number): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeChar: no current message");
    }
    this.buffer.writeUInt32(h);
    this.buffer.writeUInt32(l);
    return this;
  }

  writeBuffer(buf: Uint8Array): this {
    if (this.messagePos < 0) {
      throw new BufferError("cannot writeBuffer: no current message");
    }
    this.buffer.writeBuffer(buf);
    return this;
  }

  writeSync(): this {
    if (this.messagePos >= 0) {
      throw new BufferError(
        "cannot writeSync: the previous message is not finished",
      );
    }
    this.buffer.writeBuffer(SYNC_MESSAGE);
    return this;
  }

  writeFlush(): this {
    if (this.messagePos >= 0) {
      throw new BufferError(
        "cannot writeFlush: the previous message is not finished",
      );
    }
    this.buffer.writeBuffer(FLUSH_MESSAGE);
    return this;
  }

  unwrap(): Uint8Array {
    if (this.messagePos >= 0) {
      throw new BufferError(
        "cannot unwrap: an unfinished message is in the buffer",
      );
    }
    return this.buffer.unwrap();
  }
}

const SYNC_MESSAGE = new WriteMessageBuffer()
  .beginMessage(chars.$S)
  .endMessage()
  .unwrap();

const FLUSH_MESSAGE = new WriteMessageBuffer()
  .beginMessage(chars.$H)
  .endMessage()
  .unwrap();

const byteToHex: string[] = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}

export function uuidToBuffer(uuid: string) {
  const buf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    buf[i] = parseInt(uuid.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

export class ReadMessageBuffer {
  private bufs: Uint8Array[];
  private len: number;

  private buf0: DataView | null;
  private pos0: number;
  private len0: number;

  private curMessageType: char;
  private curMessageLen: number;
  curMessageLenUnread: number;
  private curMessageReady: boolean;

  constructor() {
    this.bufs = [];
    this.buf0 = null;
    this.pos0 = 0;
    this.len0 = 0;
    this.len = 0;

    this.curMessageType = 0;
    this.curMessageLen = 0;
    this.curMessageLenUnread = 0;
    this.curMessageReady = false;
  }

  get length(): number {
    return this.len;
  }

  feed(buf: Uint8Array): void {
    if (
      this.buf0 == null ||
      (this.pos0 === this.len0 && this.bufs.length === 0)
    ) {
      this.buf0 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      this.len0 = buf.byteLength;
      this.pos0 = 0;
      this.len = this.len0;
    } else {
      this.feedEnqueue(buf);
    }
  }

  private feedEnqueue(buf: Uint8Array): void {
    this.bufs.push(buf);
    this.len += buf.byteLength;
  }

  private ensureFirstBuf(): DataView {
    if (this.pos0 === this.len0) {
      this.__nextBuf();
    }
    const buf0 = this.buf0;
    if (buf0 == null || buf0.byteLength < 1) {
      throw new BufferError("empty buffer");
    }
    return buf0;
  }

  private checkOverread(size: number): void {
    if (this.curMessageLenUnread < size || size > this.len) {
      throw new BufferError("buffer overread");
    }
  }

  private __nextBuf(): void {
    // Only called from ensureFirstBuf().  This part
    // is factored out to let ensureFirstBuf() be inlined.
    const nextBuf = this.bufs.shift();
    if (nextBuf == null) {
      throw new BufferError("buffer overread");
    }

    this.buf0 = new DataView(
      nextBuf.buffer,
      nextBuf.byteOffset,
      nextBuf.byteLength,
    );
    this.pos0 = 0;
    this.len0 = nextBuf.byteLength;
  }

  private discardBuffer(size: number): void {
    this.ensureFirstBuf();
    while (true) {
      if (this.pos0 + size > this.len0) {
        const nread = this.len0 - this.pos0;

        this.pos0 = this.len0;
        this.len -= nread;
        size -= nread;

        this.ensureFirstBuf();
      } else {
        this.pos0 += size;
        this.len -= size;
        break;
      }
    }
  }

  private _finishMessage(): void {
    this.curMessageLen = 0;
    this.curMessageLenUnread = 0;
    this.curMessageReady = false;
    this.curMessageType = 0;
  }

  private __readBufferCopy(buf0: DataView, size: number): Uint8Array {
    const ret = new Uint8Array(size);
    let retPos = 0;

    while (true) {
      if (this.pos0 + size > this.len0) {
        const nread = this.len0 - this.pos0;

        ret.set(
          new Uint8Array(buf0.buffer, buf0.byteOffset + this.pos0, nread),
          retPos,
        );
        retPos += nread;

        this.pos0 = this.len0;
        this.len -= nread;
        size -= nread;

        buf0 = this.ensureFirstBuf();
      } else {
        ret.set(
          new Uint8Array(buf0.buffer, buf0.byteOffset + this.pos0, size),
          retPos,
        );
        this.pos0 += size;
        this.len -= size;
        break;
      }
    }

    return ret;
  }

  private _readBuffer(size: number): Uint8Array {
    if (size === 0) {
      return EMPTY_BUFFER;
    }

    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + size <= this.len0) {
      // If the requested *size* fits in the first buffer
      // do a slice operation.
      const ret = new Uint8Array(
        buf0.buffer,
        buf0.byteOffset + this.pos0,
        size,
      );
      this.pos0 += size;
      this.len -= size;
      return ret;
    }

    return this.__readBufferCopy(buf0, size);
  }

  readBuffer(size: number): Uint8Array {
    this.checkOverread(size);
    const buf = this._readBuffer(size);
    this.curMessageLenUnread -= size;
    return buf;
  }

  readUUID(): string {
    const buf = this.readBuffer(16);
    return (
      byteToHex[buf[0]] +
      byteToHex[buf[1]] +
      byteToHex[buf[2]] +
      byteToHex[buf[3]] +
      byteToHex[buf[4]] +
      byteToHex[buf[5]] +
      byteToHex[buf[6]] +
      byteToHex[buf[7]] +
      byteToHex[buf[8]] +
      byteToHex[buf[9]] +
      byteToHex[buf[10]] +
      byteToHex[buf[11]] +
      byteToHex[buf[12]] +
      byteToHex[buf[13]] +
      byteToHex[buf[14]] +
      byteToHex[buf[15]]
    );
  }

  readChar(): char {
    this.checkOverread(1);
    const buf0 = this.ensureFirstBuf();
    const ret = buf0.getUint8(this.pos0);
    this.pos0++;
    this.curMessageLenUnread--;
    this.len--;
    return ret;
  }

  readInt16(): number {
    this.checkOverread(2);
    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + 2 <= this.len0) {
      const ret = buf0.getInt16(this.pos0);
      this.pos0 += 2;
      this.curMessageLenUnread -= 2;
      this.len -= 2;
      return ret;
    }

    const buf = this._readBuffer(2);
    this.curMessageLenUnread -= 2;
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getInt16(0);
  }

  readInt32(): number {
    this.checkOverread(4);
    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + 4 <= this.len0) {
      const ret = buf0.getInt32(this.pos0);
      this.pos0 += 4;
      this.curMessageLenUnread -= 4;
      this.len -= 4;
      return ret;
    }

    const buf = this._readBuffer(4);
    this.curMessageLenUnread -= 4;
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getInt32(0);
  }

  readUInt16(): number {
    this.checkOverread(2);
    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + 2 <= this.len0) {
      const ret = buf0.getUint16(this.pos0);
      this.pos0 += 2;
      this.curMessageLenUnread -= 2;
      this.len -= 2;
      return ret;
    }

    const buf = this._readBuffer(2);
    this.curMessageLenUnread -= 2;
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint16(
      0,
    );
  }

  readUInt32(): number {
    this.checkOverread(4);
    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + 4 <= this.len0) {
      const ret = buf0.getUint32(this.pos0);
      this.pos0 += 4;
      this.curMessageLenUnread -= 4;
      this.len -= 4;
      return ret;
    }

    const buf = this._readBuffer(4);
    this.curMessageLenUnread -= 4;
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(
      0,
    );
  }

  readBigInt64(): bigint {
    this.checkOverread(8);
    const buf0 = this.ensureFirstBuf();

    if (this.pos0 + 8 <= this.len0) {
      const ret = buf0.getBigInt64(this.pos0);
      this.pos0 += 8;
      this.curMessageLenUnread -= 8;
      this.len -= 8;
      return ret;
    }

    const buf = this._readBuffer(8);
    this.curMessageLenUnread -= 8;
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigInt64(
      0,
    );
  }

  readString(): string {
    const len = this.readInt32();
    const buf = this.readBuffer(len);
    return utf8Decoder.decode(buf);
  }

  readLenPrefixedBuffer(): Uint8Array {
    const len = this.readInt32();
    return this.readBuffer(len);
  }

  takeMessage(): boolean {
    if (this.curMessageReady) {
      return true;
    }

    if (this.curMessageType === 0) {
      if (this.len < 1) {
        return false;
      }
      const buf0 = this.ensureFirstBuf();
      this.curMessageType = buf0.getUint8(this.pos0);
      this.pos0++;
      this.len--;
    }

    if (this.curMessageLen === 0) {
      if (this.len < 4) {
        return false;
      }
      const buf0 = this.ensureFirstBuf();
      if (this.pos0 + 4 <= this.len0) {
        this.curMessageLen = buf0.getInt32(this.pos0);
        this.pos0 += 4;
        this.len -= 4;
      } else {
        const buf = this._readBuffer(4);
        this.curMessageLen = new DataView(
          buf.buffer,
          buf.byteOffset,
          buf.byteLength,
        ).getInt32(0);
      }

      this.curMessageLenUnread = this.curMessageLen - 4;
    }

    if (this.len < this.curMessageLenUnread) {
      return false;
    }

    this.curMessageReady = true;
    return true;
  }

  getMessageType(): char {
    return this.curMessageType;
  }

  takeMessageType(mtype: char): boolean {
    if (this.curMessageReady) {
      return this.curMessageType === mtype;
    }

    if (this.len >= 1) {
      const buf0 = this.ensureFirstBuf();
      const unreadMessageType = buf0.getUint8(this.pos0);
      return mtype === unreadMessageType && this.takeMessage();
    }

    return false;
  }

  putMessage(): void {
    if (!this.curMessageReady) {
      throw new BufferError("cannot put message: no message taken");
    }
    if (this.curMessageLenUnread !== this.curMessageLen - 4) {
      throw new BufferError("cannot put message: message is partially read");
    }
    this.curMessageReady = false;
  }

  discardMessage(): void {
    if (!this.curMessageReady) {
      throw new BufferError("no message to discard");
    }
    if (this.curMessageLenUnread > 0) {
      this.discardBuffer(this.curMessageLenUnread);
    }
    this._finishMessage();
  }

  consumeMessage(): Uint8Array {
    if (!this.curMessageReady) {
      throw new BufferError("no message to consume");
    }

    let buf: Uint8Array;
    if (this.curMessageLenUnread > 0) {
      buf = this._readBuffer(this.curMessageLenUnread);
      this.curMessageLenUnread = 0;
    } else {
      buf = EMPTY_BUFFER;
    }

    this._finishMessage();
    return buf;
  }

  consumeMessageInto(frb: ReadBuffer): void {
    if (!this.curMessageReady) {
      throw new BufferError("no message to consume");
    }

    if (this.curMessageLenUnread > 0) {
      if (this.pos0 + this.curMessageLenUnread <= this.len0) {
        ReadBuffer.init(
          frb,
          new Uint8Array(
            this.buf0!.buffer,
            this.buf0!.byteOffset + this.pos0,
            this.curMessageLenUnread,
          ),
        );
        this.pos0 += this.curMessageLenUnread;
        this.len -= this.curMessageLenUnread;
      } else {
        const buf = this._readBuffer(this.curMessageLenUnread);
        ReadBuffer.init(frb, buf);
      }
      this.curMessageLenUnread = 0;
    } else {
      ReadBuffer.init(frb, EMPTY_BUFFER);
    }

    this._finishMessage();
  }

  finishMessage(): void {
    if (this.curMessageType === 0 || !this.curMessageReady) {
      // The message has already been finished (e.g. by consumeMessage()),
      // or has been put back by putMessage().
      return;
    }

    if (this.curMessageLenUnread) {
      throw new BufferError(
        `cannot finishMessage: unread data in message ` +
          `"${chars.chr(this.curMessageType)}"`,
      );
    }

    this._finishMessage();
  }
}

export class ReadBuffer {
  private _rawBuffer: Uint8Array;
  private buffer: DataView;
  private pos: number;
  private len: number;

  constructor(buf: Uint8Array) {
    this._rawBuffer = buf;
    this.buffer = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.len = buf.length;
    this.pos = 0;
  }

  get position(): number {
    return this.pos;
  }

  get length(): number {
    return this.len - this.pos;
  }

  finish(message?: string): void {
    if (this.len !== this.pos) {
      throw new BufferError(message ?? "unexpected trailing data in buffer");
    }
  }

  discard(size: number): void {
    if (this.pos + size > this.len) {
      throw new BufferError("buffer overread");
    }
    this.pos += size;
  }

  readUInt8(): number {
    if (this.pos + 1 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getUint8(this.pos);
    this.pos++;
    return num;
  }

  readUInt16(): number {
    if (this.pos + 2 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getUint16(this.pos);
    this.pos += 2;
    return num;
  }

  readInt8(): number {
    if (this.pos + 1 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getInt8(this.pos);
    this.pos++;
    return num;
  }

  readInt16(): number {
    if (this.pos + 2 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getInt16(this.pos);
    this.pos += 2;
    return num;
  }

  readInt32(): number {
    if (this.pos + 4 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getInt32(this.pos);
    this.pos += 4;
    return num;
  }

  readFloat32(): number {
    if (this.pos + 4 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getFloat32(this.pos);
    this.pos += 4;
    return num;
  }

  readFloat64(le?: boolean): number {
    if (this.pos + 8 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getFloat64(this.pos, le);
    this.pos += 8;
    return num;
  }

  readUInt32(le?: boolean): number {
    if (this.pos + 4 > this.len) {
      throw new BufferError("buffer overread");
    }
    const num = this.buffer.getUint32(this.pos, le);
    this.pos += 4;
    return num;
  }

  private reportInt64Overflow(hi: number, lo: number): never {
    const bhi = BigInt(hi);
    const blo = BigInt(lo >>> 0);
    const num = bhi * BigInt(0x100000000) + blo;

    throw new BufferError(
      `integer overflow: cannot unpack <std::int64>'${num.toString()}' ` +
        `into JavaScript Number type without losing precision`,
    );
  }

  readInt64(): number {
    if (this.pos + 8 > this.len) {
      throw new BufferError("buffer overread");
    }

    const hi = this.buffer.getInt32(this.pos);
    const lo = this.buffer.getInt32(this.pos + 4);
    this.pos += 8;

    if (hi === 0) {
      return lo >>> 0;
    } else if (hi >= -0x200000 && hi < 0x200000) {
      return hi * 0x100_000_000 + (lo >>> 0);
    }

    return this.reportInt64Overflow(hi, lo);
  }

  readBigInt64(): bigint {
    if (this.pos + 8 > this.len) {
      throw new BufferError("buffer overread");
    }
    const ret = this.buffer.getBigInt64(this.pos);
    this.pos += 8;
    return ret;
  }

  readBoolean(): boolean {
    return this.readUInt8() !== 0;
  }

  readBuffer(size: number): Uint8Array {
    if (this.pos + size > this.len) {
      throw new BufferError("buffer overread");
    }
    const buf = this._rawBuffer.subarray(this.pos, this.pos + size);
    this.pos += size;
    return buf;
  }

  readUUIDBytes(): Uint8Array {
    return this.readBuffer(16);
  }

  readUUID(dash = ""): string {
    if (this.pos + 16 > this.len) {
      throw new BufferError("buffer overread");
    }
    const buf = this._rawBuffer;
    const pos = this.pos;
    const uuid =
      byteToHex[buf[pos + 0]] +
      byteToHex[buf[pos + 1]] +
      byteToHex[buf[pos + 2]] +
      byteToHex[buf[pos + 3]] +
      dash +
      byteToHex[buf[pos + 4]] +
      byteToHex[buf[pos + 5]] +
      dash +
      byteToHex[buf[pos + 6]] +
      byteToHex[buf[pos + 7]] +
      dash +
      byteToHex[buf[pos + 8]] +
      byteToHex[buf[pos + 9]] +
      dash +
      byteToHex[buf[pos + 10]] +
      byteToHex[buf[pos + 11]] +
      byteToHex[buf[pos + 12]] +
      byteToHex[buf[pos + 13]] +
      byteToHex[buf[pos + 14]] +
      byteToHex[buf[pos + 15]];
    this.pos += 16;
    return uuid;
  }

  readString(): string {
    const len = this.readUInt32();
    const buf = this.readBuffer(len);
    return utf8Decoder.decode(buf);
  }

  consumeAsString(): string {
    if (this.pos === this.len) {
      // Fast path.
      return "";
    }

    const res = utf8Decoder.decode(
      this._rawBuffer.subarray(this.pos, this.len),
    );
    this.pos = this.len;
    return res;
  }

  consumeAsBuffer(): Uint8Array {
    const res = this._rawBuffer.subarray(this.pos, this.len);
    this.pos = this.len;
    return res;
  }

  sliceInto(frb: ReadBuffer, size: number): void {
    if (this.pos + size > this.len) {
      throw new BufferError("buffer overread");
    }
    frb._rawBuffer = this._rawBuffer;
    frb.buffer = this.buffer;
    frb.pos = this.pos;
    frb.len = this.pos + size;
    this.pos += size;
  }

  static init(frb: ReadBuffer, buffer: Uint8Array): void {
    frb._rawBuffer = buffer;
    frb.buffer = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    frb.pos = 0;
    frb.len = buffer.byteLength;
  }

  static alloc(): ReadBuffer {
    return new this(EMPTY_BUFFER);
  }
}
