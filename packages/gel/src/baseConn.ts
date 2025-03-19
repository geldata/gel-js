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

import { INVALID_CODEC, NullCodec, NULL_CODEC } from "./codecs/codecs";
import type { ICodec } from "./codecs/ifaces";
import { ObjectCodec } from "./codecs/object";
import type { CodecsRegistry } from "./codecs/registry";
import { versionGreaterThan, versionGreaterThanOrEqual } from "./utils";
import * as errors from "./errors";
import { resolveErrorCode, errorFromJSON } from "./errors/resolve";
import type { CodecContext } from "./codecs/context";
import { NOOP_CODEC_CONTEXT } from "./codecs/context";
import type {
  QueryOptions,
  ProtocolVersion,
  QueryArgs,
  ServerSettings,
} from "./ifaces";
import { Cardinality, OutputFormat, Language } from "./ifaces";
import {
  ReadBuffer,
  ReadMessageBuffer,
  utf8Decoder,
  WriteBuffer,
  WriteMessageBuffer,
} from "./primitives/buffer";
import * as chars from "./primitives/chars";
import Event from "./primitives/event";
import LRU from "./primitives/lru";
import type { SerializedSessionState } from "./options";
import { Options } from "./options";

export const PROTO_VER: ProtocolVersion = [3, 0];
export const PROTO_VER_MIN: ProtocolVersion = [0, 9];

enum TransactionStatus {
  TRANS_IDLE = 0, // connection idle
  TRANS_ACTIVE = 1, // command in progress
  TRANS_INTRANS = 2, // idle, within transaction block
  TRANS_INERROR = 3, // idle, within failed transaction
  TRANS_UNKNOWN = 4, // cannot determine status
}

export enum Capabilities {
  NONE = 0,
  MODIFICATONS = 1 << 0, // query is not read-only
  SESSION_CONFIG = 1 << 1, // query contains session config change
  TRANSACTION = 1 << 2, // query contains start/commit/rollback of
  // transaction or savepoint manipulation
  DDL = 1 << 3, // query contains DDL
  PERSISTENT_CONFIG = 1 << 4, // server or database config change
  SET_GLOBAL = 1 << 5,
  ALL = 0xffff_ffff,
}

const NO_TRANSACTION_CAPABILITIES =
  (Capabilities.ALL & ~Capabilities.TRANSACTION) >>> 0;

const NO_TRANSACTION_CAPABILITIES_BYTES = new Uint8Array(Array(8).fill(255));
new DataView(NO_TRANSACTION_CAPABILITIES_BYTES.buffer).setUint32(
  4,
  NO_TRANSACTION_CAPABILITIES,
);

export const RESTRICTED_CAPABILITIES =
  (Capabilities.ALL &
    ~Capabilities.TRANSACTION &
    ~Capabilities.SESSION_CONFIG &
    ~Capabilities.SET_GLOBAL) >>>
  0;

enum CompilationFlag {
  INJECT_OUTPUT_TYPE_IDS = 1 << 0,
  INJECT_OUTPUT_TYPE_NAMES = 1 << 1,
  INJECT_OUTPUT_OBJECT_IDS = 1 << 2,
}

const OLD_ERROR_CODES = new Map([
  [0x05_03_00_01, 0x05_03_01_01], // TransactionSerializationError #2431
  [0x05_03_00_02, 0x05_03_01_02], // TransactionDeadlockError      #2431
]);

export type ParseResult = [
  cardinality: Cardinality,
  inCodec: ICodec,
  outCodec: ICodec,
  capabilities: number,
  inCodecBuffer: Uint8Array | null,
  outCodecBuffer: Uint8Array | null,
  warnings: errors.WarningMessage[],
];

export type connConstructor = new (
  registry: CodecsRegistry,
) => BaseRawConnection;

export class BaseRawConnection {
  protected connected = false;

  protected lastStatus: string | null;

  protected codecsRegistry: CodecsRegistry;
  protected queryCodecCache: LRU<string, [number, ICodec, ICodec, number]>;

  protected serverSecret: Uint8Array | null;
  /** @internal */ serverSettings: ServerSettings;
  private serverXactStatus: TransactionStatus;

  protected buffer: ReadMessageBuffer;

  protected messageWaiter: Event | null;
  protected connWaiter: Event;
  connAbortWaiter: Event;

  protected _abortedWith: Error | null = null;

  protocolVersion: ProtocolVersion = PROTO_VER;

  protected stateCodec: ICodec = INVALID_CODEC;
  protected stateCache = new WeakMap<Options, Uint8Array>();
  lastStateUpdate: SerializedSessionState | null = null;

  protected adminUIMode = false;

  /** @internal */
  protected constructor(registry: CodecsRegistry) {
    this.buffer = new ReadMessageBuffer();

    this.codecsRegistry = registry;
    this.queryCodecCache = new LRU({ capacity: 1000 });

    this.lastStatus = null;

    this.serverSecret = null;
    this.serverSettings = {};
    this.serverXactStatus = TransactionStatus.TRANS_UNKNOWN;

    this.messageWaiter = null;
    this.connWaiter = new Event();
    this.connAbortWaiter = new Event();
  }

  protected throwNotImplemented(method: string): never {
    throw new errors.InternalClientError(`method ${method} is not implemented`);
  }

  protected async _waitForMessage(): Promise<void> {
    this.throwNotImplemented("_waitForMessage");
  }

  protected _sendData(_data: Uint8Array): void {
    this.throwNotImplemented("_sendData");
  }

  getConnAbortError(): Error {
    return (
      this._abortedWith ?? new errors.InterfaceError(`client has been closed`)
    );
  }

  protected _checkState(): void {
    if (this.isClosed()) {
      throw this.getConnAbortError();
    }
  }

  protected _abortWithError(err: Error): void {
    this._abortedWith = err;
    this._abort();
  }

  protected _ignoreHeaders(): void {
    let numFields = this.buffer.readInt16();
    while (numFields) {
      this.buffer.readInt16();
      this.buffer.readLenPrefixedBuffer();
      numFields--;
    }
  }

  protected _readHeaders(): Record<string, string> {
    const numFields = this.buffer.readInt16();
    const headers: Record<string, string> = {};
    for (let i = 0; i < numFields; i++) {
      const key = this.buffer.readString();
      const value = this.buffer.readString();
      headers[key] = value;
    }

    return headers;
  }

  protected _abortWaiters(err: Error): void {
    if (!this.connWaiter.done) {
      this.connWaiter.setError(err);
    }
    this.messageWaiter?.setError(err);
    this.messageWaiter = null;
  }

  protected _parseHeaders(): Map<number, Uint8Array> {
    const ret = new Map<number, Uint8Array>();
    let numFields = this.buffer.readInt16();
    while (numFields) {
      const key = this.buffer.readInt16();
      const value = this.buffer.readLenPrefixedBuffer();
      ret.set(key, value);
      numFields--;
    }
    return ret;
  }

  private _parseDescribeTypeMessage(
    query: string,
  ): [
    Cardinality,
    ICodec,
    ICodec,
    number,
    Uint8Array,
    Uint8Array,
    errors.WarningMessage[],
  ] {
    let capabilities = -1;
    let warnings: errors.WarningMessage[] = [];

    const headers = this._readHeaders();
    if (headers.warnings != null) {
      warnings = JSON.parse(headers.warnings).map((warning: any) => {
        const err = errorFromJSON(warning);
        (err as any)._query = query;
        return err;
      });
    }
    capabilities = Number(this.buffer.readBigInt64());

    const cardinality: Cardinality = this.buffer.readChar();

    const inTypeId = this.buffer.readUUID();
    const inTypeData = this.buffer.readLenPrefixedBuffer();

    const outTypeId = this.buffer.readUUID();
    const outTypeData = this.buffer.readLenPrefixedBuffer();

    this.buffer.finishMessage();

    let inCodec = this.codecsRegistry.getCodec(inTypeId);
    if (inCodec == null) {
      inCodec = this.codecsRegistry.buildCodec(
        inTypeData,
        this.protocolVersion,
      );
    }

    let outCodec = this.codecsRegistry.getCodec(outTypeId);
    if (outCodec == null) {
      outCodec = this.codecsRegistry.buildCodec(
        outTypeData,
        this.protocolVersion,
      );
    }

    return [
      cardinality,
      inCodec,
      outCodec,
      capabilities,
      inTypeData,
      outTypeData,
      warnings,
    ];
  }

  protected _parseCommandCompleteMessage(): string {
    this._ignoreHeaders();

    this.buffer.readBigInt64();
    const status = this.buffer.readString();

    const stateTypeId = this.buffer.readUUID();
    const stateData = this.buffer.readLenPrefixedBuffer();

    if (this.adminUIMode && stateTypeId === this.stateCodec.tid) {
      this.lastStateUpdate = this.stateCodec.decode(
        new ReadBuffer(stateData),
        NOOP_CODEC_CONTEXT,
      );
    }

    this.buffer.finishMessage();
    return status;
  }

  protected _parseErrorMessage(): Error {
    this.buffer.readChar(); // ignore severity
    const code = this.buffer.readUInt32();
    const message = this.buffer.readString();

    const errorType = resolveErrorCode(OLD_ERROR_CODES.get(code) ?? code);
    const err = new errorType(message);

    (err as any)._attrs = this._parseHeaders();

    this.buffer.finishMessage();

    if (err instanceof errors.AuthenticationError) {
      throw err;
    }

    return err;
  }

  protected _parseSyncMessage(): void {
    this._parseHeaders(); // TODO: Reject Headers
    const status = this.buffer.readChar();
    switch (status) {
      case chars.$I:
        this.serverXactStatus = TransactionStatus.TRANS_IDLE;
        break;
      case chars.$T:
        this.serverXactStatus = TransactionStatus.TRANS_INTRANS;
        break;
      case chars.$E:
        this.serverXactStatus = TransactionStatus.TRANS_INERROR;
        break;
      default:
        this.serverXactStatus = TransactionStatus.TRANS_UNKNOWN;
    }

    this.buffer.finishMessage();
  }

  private _redirectDataMessages(result: WriteBuffer): void {
    const $D = chars.$D;
    const buffer = this.buffer;

    while (buffer.takeMessageType($D)) {
      const msg = buffer.consumeMessage();
      result.writeChar($D);
      result.writeInt32(msg.length + 4);
      result.writeBuffer(msg);
    }
  }

  private _parseDataMessages(
    codec: ICodec,
    result: any[] | WriteBuffer,
    ctx: CodecContext,
  ): void {
    const frb = ReadBuffer.alloc();
    const $D = chars.$D;
    const buffer = this.buffer;

    if (Array.isArray(result)) {
      while (buffer.takeMessageType($D)) {
        buffer.consumeMessageInto(frb);
        frb.discard(6);
        result.push(codec.decode(frb, ctx));
        frb.finish();
      }
    } else {
      this._redirectDataMessages(result);
    }
  }

  private _parseServerSettings(name: string, value: Uint8Array): void {
    switch (name) {
      case "suggested_pool_concurrency": {
        this.serverSettings.suggested_pool_concurrency = parseInt(
          utf8Decoder.decode(value),
          10,
        );
        break;
      }
      case "system_config": {
        const buf = new ReadBuffer(value);
        const typedescLen = buf.readInt32() - 16;
        const typedescId = buf.readUUID();
        const typedesc = buf.readBuffer(typedescLen);

        let codec = this.codecsRegistry.getCodec(typedescId);
        if (codec === null) {
          codec = this.codecsRegistry.buildCodec(
            typedesc,
            this.protocolVersion,
          );
        }

        buf.discard(4); // discard data length int32
        const data = codec.decode(buf, NOOP_CODEC_CONTEXT);
        buf.finish();

        this.serverSettings.system_config = data;
        break;
      }
      default:
        this.serverSettings[name] = value;
        break;
    }
  }

  protected _parseDescribeStateMessage() {
    const typedescId = this.buffer.readUUID();
    const typedesc = this.buffer.readBuffer(this.buffer.readInt32());

    let codec = this.codecsRegistry.getCodec(typedescId);
    if (codec === null) {
      codec = this.codecsRegistry.buildCodec(typedesc, this.protocolVersion);
    }
    this.stateCodec = codec;
    this.stateCache = new WeakMap();
    this.buffer.finishMessage();
  }

  protected _fallthrough(): void {
    const mtype = this.buffer.getMessageType();

    switch (mtype) {
      case chars.$S: {
        const name = this.buffer.readString();
        const value = this.buffer.readLenPrefixedBuffer();
        this._parseServerSettings(name, value);
        this.buffer.finishMessage();
        break;
      }

      case chars.$L: {
        const severity = this.buffer.readChar();
        const code = this.buffer.readUInt32();
        const message = this.buffer.readString();
        this._parseHeaders();
        this.buffer.finishMessage();

        console.info("SERVER MESSAGE", severity, code, message);

        break;
      }

      default:
        // TODO: terminate connection
        throw new errors.UnexpectedMessageError(
          `unexpected message type ${mtype} ("${chars.chr(mtype)}")`,
        );
    }
  }

  private _encodeArgs(
    args: QueryArgs,
    inCodec: ICodec,
    ctx: CodecContext,
  ): Uint8Array {
    if (inCodec === NULL_CODEC) {
      if (args != null) {
        throw new errors.QueryArgumentError(
          `This query does not contain any query parameters, ` +
            `but query arguments were provided to the 'query*()' method`,
        );
      }
      return NullCodec.BUFFER;
    }

    if (inCodec instanceof ObjectCodec) {
      return inCodec.encodeArgs(args, ctx);
    }

    // Shouldn't ever happen.
    throw new errors.ProtocolError("invalid input codec");
  }

  private _encodeParseParams(
    wb: WriteMessageBuffer,
    query: string,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
    state: Options,
    capabilitiesFlags: number,
    options: QueryOptions | undefined,
    language: Language,
  ) {
    if (versionGreaterThanOrEqual(this.protocolVersion, [3, 0])) {
      if (state.annotations.size >= 1 << 16) {
        throw new errors.InternalClientError("too many annotations");
      }
      wb.writeUInt16(state.annotations.size);
      for (const [name, value] of state.annotations) {
        wb.writeString(name);
        wb.writeString(value);
      }
    } else {
      wb.writeUInt16(0);
    }
    wb.writeFlags(0xffff_ffff, capabilitiesFlags);
    wb.writeFlags(
      0,
      0 |
        (options?.injectObjectids
          ? CompilationFlag.INJECT_OUTPUT_OBJECT_IDS
          : 0) |
        (options?.injectTypeids ? CompilationFlag.INJECT_OUTPUT_TYPE_IDS : 0) |
        (options?.injectTypenames
          ? CompilationFlag.INJECT_OUTPUT_TYPE_NAMES
          : 0),
    );
    wb.writeBigInt64(options?.implicitLimit ?? BigInt(0));
    if (versionGreaterThanOrEqual(this.protocolVersion, [3, 0])) {
      wb.writeChar(language);
    }
    wb.writeChar(outputFormat);
    wb.writeChar(
      expectedCardinality === Cardinality.ONE ||
        expectedCardinality === Cardinality.AT_MOST_ONE
        ? Cardinality.AT_MOST_ONE
        : Cardinality.MANY,
    );
    wb.writeString(query);

    if (!this.adminUIMode && state.isDefaultSession()) {
      wb.writeBuffer(NULL_CODEC.tidBuffer);
      wb.writeInt32(0);
    } else {
      wb.writeBuffer(this.stateCodec.tidBuffer);
      if (this.stateCodec === INVALID_CODEC || this.stateCodec === NULL_CODEC) {
        wb.writeInt32(0);
      } else {
        if (!this.stateCache.has(state)) {
          const buf = new WriteBuffer();
          this.stateCodec.encode(buf, state._serialise(), NOOP_CODEC_CONTEXT);
          this.stateCache.set(state, buf.unwrap());
        }
        wb.writeBuffer(this.stateCache.get(state)!);
      }
    }
  }

  async _parse(
    language: Language,
    query: string,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
    state: Options,
    capabilitiesFlags: number = RESTRICTED_CAPABILITIES,
    options?: QueryOptions,
  ): Promise<ParseResult> {
    const wb = new WriteMessageBuffer();
    wb.beginMessage(chars.$P);

    this._encodeParseParams(
      wb,
      query,
      outputFormat,
      expectedCardinality,
      state,
      capabilitiesFlags,
      options,
      language,
    );

    wb.endMessage();
    wb.writeSync();

    this._sendData(wb.unwrap());

    let parsing = true;
    let error: Error | null = null;
    let newCard: Cardinality | null = null;
    let capabilities = -1;
    let inCodec: ICodec | null = null;
    let outCodec: ICodec | null = null;
    let inCodecBuf: Uint8Array | null = null;
    let outCodecBuf: Uint8Array | null = null;
    let warnings: errors.WarningMessage[] = [];

    while (parsing) {
      if (!this.buffer.takeMessage()) {
        await this._waitForMessage();
      }

      const mtype = this.buffer.getMessageType();

      switch (mtype) {
        case chars.$T: {
          try {
            [
              newCard,
              inCodec,
              outCodec,
              capabilities,
              inCodecBuf,
              outCodecBuf,
              warnings,
            ] = this._parseDescribeTypeMessage(query);
            const key = this._getQueryCacheKey(
              query,
              outputFormat,
              expectedCardinality,
            );
            this.queryCodecCache.set(key, [
              newCard,
              inCodec,
              outCodec,
              capabilities,
            ]);
          } catch (e: any) {
            error = e;
          }
          break;
        }

        case chars.$E: {
          error = this._parseErrorMessage();
          (error as any)._query = query;
          break;
        }

        case chars.$s: {
          // The state descriptor has change, a modification might have
          // been applied to the schema, let's reset codec contexts.
          Options.signalSchemaChange();

          this._parseDescribeStateMessage();
          break;
        }

        case chars.$Z: {
          this._parseSyncMessage();
          parsing = false;
          break;
        }

        default:
          this._fallthrough();
      }
    }

    if (error !== null) {
      if (error instanceof errors.StateMismatchError) {
        return this._parse(
          language,
          query,
          outputFormat,
          expectedCardinality,
          state,
          capabilitiesFlags,
          options,
        );
      }
      throw error;
    }

    return [
      newCard!,
      inCodec!,
      outCodec!,
      capabilities,
      inCodecBuf,
      outCodecBuf,
      warnings,
    ];
  }

  protected async _executeFlow(
    language: Language,
    query: string,
    args: QueryArgs,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
    state: Options,
    inCodec: ICodec,
    outCodec: ICodec,
    result: any[] | WriteBuffer,
    capabilitiesFlags: number = RESTRICTED_CAPABILITIES,
    options?: QueryOptions,
  ): Promise<errors.WarningMessage[]> {
    let ctx = state.makeCodecContext();

    const wb = new WriteMessageBuffer();
    wb.beginMessage(chars.$O);

    this._encodeParseParams(
      wb,
      query,
      outputFormat,
      expectedCardinality,
      state,
      capabilitiesFlags,
      options,
      language,
    );

    wb.writeBuffer(inCodec.tidBuffer);
    wb.writeBuffer(outCodec.tidBuffer);

    if (inCodec) {
      wb.writeBuffer(this._encodeArgs(args, inCodec, ctx));
    } else {
      wb.writeInt32(0);
    }

    wb.endMessage();
    wb.writeSync();

    this._sendData(wb.unwrap());

    let error: Error | null = null;
    let parsing = true;
    let warnings: errors.WarningMessage[] = [];

    while (parsing) {
      if (!this.buffer.takeMessage()) {
        await this._waitForMessage();
      }

      const mtype = this.buffer.getMessageType();

      switch (mtype) {
        case chars.$D: {
          if (error == null) {
            try {
              this._parseDataMessages(outCodec!, result, ctx);
            } catch (e: any) {
              error = e;
              this.buffer.finishMessage();
            }
          } else {
            this.buffer.discardMessage();
          }
          break;
        }

        case chars.$C: {
          this.lastStatus = this._parseCommandCompleteMessage();
          break;
        }

        case chars.$Z: {
          this._parseSyncMessage();
          parsing = false;
          break;
        }

        case chars.$T: {
          try {
            ctx = state.makeCodecContext();

            const [
              newCard,
              newInCodec,
              newOutCodec,
              capabilities,
              _,
              __,
              _warnings,
            ] = this._parseDescribeTypeMessage(query);

            /* Quoting the docs:

            - If the declared input type descriptor does not match
              the expected value, a CommandDataDescription message is
              returned followed by a ParameterTypeMismatchError in
              an ErrorResponse message.

            - If the declared output type descriptor does not match,
              the server will send a CommandDataDescription prior
              to sending any Data messages.

            Therefore, basically receiving CommandDataDescription
            means that our codecs have outdate knowledge of the schema.
            The only exception to that is if our codecs were NULL codecs
            in the first place, in which case we're here because we want
            to learn
            */
            if (
              (outCodec !== NULL_CODEC && outCodec.tid !== newOutCodec.tid) ||
              (inCodec !== NULL_CODEC && inCodec.tid !== newInCodec.tid)
            ) {
              Options.signalSchemaChange();

              // If this was the result of outCodec mismatch, we'll get
              // the information to build a new one, build it, and
              // then continue this loop to receiving and parsing data
              // messages. In this case we want a fresh new CodecContext.
              ctx = state.makeCodecContext();
            }

            const key = this._getQueryCacheKey(
              query,
              outputFormat,
              expectedCardinality,
            );
            this.queryCodecCache.set(key, [
              newCard,
              newInCodec,
              newOutCodec,
              capabilities,
            ]);
            outCodec = newOutCodec;
            warnings = _warnings;
          } catch (e: any) {
            // An error happened, so we don't know if we did bump the internal
            // schema tracker or not, so let's do it again to be on the safe
            // side.
            Options.signalSchemaChange();

            // Keep parsing the buffer, we'll raise it later.
            error = e;
          }
          break;
        }

        case chars.$s: {
          // Quoting docs:
          //
          //    If the declared state type descriptor does not match
          //    the expected value, a StateDataDescription message is
          //    returned followed by a StateMismatchError in
          //    an ErrorResponse message
          //
          // If we're here it means the state data descriptor has changed,
          // which can be the result of a new global added, which is a schema
          // changes. So let's signal it just to be safe.
          Options.signalSchemaChange();

          this._parseDescribeStateMessage();
          break;
        }

        case chars.$E: {
          error = this._parseErrorMessage();
          (error as any)._query = query;
          break;
        }

        default:
          this._fallthrough();
      }
    }

    if (error != null) {
      if (error instanceof errors.StateMismatchError) {
        return this._executeFlow(
          language,
          query,
          args,
          outputFormat,
          expectedCardinality,
          state,
          inCodec,
          outCodec,
          result,
          capabilitiesFlags,
          options,
        );
      }
      throw error;
    }

    return warnings;
  }

  private _getQueryCacheKey(
    query: string,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
    language: Language = Language.EDGEQL,
  ): string {
    const expectOne =
      expectedCardinality === Cardinality.ONE ||
      expectedCardinality === Cardinality.AT_MOST_ONE;
    return [language, outputFormat, expectOne, query.length, query].join(";");
  }

  private _validateFetchCardinality(
    card: Cardinality,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
  ): void {
    if (
      expectedCardinality === Cardinality.ONE &&
      card === Cardinality.NO_RESULT
    ) {
      throw new errors.NoDataError(
        `query executed via queryRequiredSingle${
          outputFormat === OutputFormat.JSON ? "JSON" : ""
        }() returned no data`,
      );
    }
  }

  async fetch(
    query: string,
    args: QueryArgs = null,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
    state: Options,
    privilegedMode = false,
    language: Language = Language.EDGEQL,
  ): Promise<{ result: any; warnings: errors.WarningMessage[] }> {
    if (
      language !== Language.EDGEQL &&
      versionGreaterThan([3, 0], this.protocolVersion)
    ) {
      throw new errors.UnsupportedFeatureError(
        `the server does not support SQL queries, upgrade to 6.0 or newer`,
      );
    }

    this._checkState();

    const requiredOne = expectedCardinality === Cardinality.ONE;
    const expectOne =
      requiredOne || expectedCardinality === Cardinality.AT_MOST_ONE;
    const asJson = outputFormat === OutputFormat.JSON;

    const key = this._getQueryCacheKey(
      query,
      outputFormat,
      expectedCardinality,
      language,
    );
    const ret: any[] = [];
    // @ts-ignore
    let _;
    let warnings: errors.WarningMessage[] = [];

    let [card, inCodec, outCodec] = this.queryCodecCache.get(key) ?? [];

    if (card) {
      this._validateFetchCardinality(card, outputFormat, expectedCardinality);
    }

    if (
      (!inCodec && args !== null) ||
      (this.stateCodec === INVALID_CODEC && !state.isDefaultSession())
    ) {
      [card, inCodec, outCodec, _, _, _, warnings] = await this._parse(
        language,
        query,
        outputFormat,
        expectedCardinality,
        state,
        privilegedMode ? Capabilities.ALL : undefined,
      );
      this._validateFetchCardinality(card, outputFormat, expectedCardinality);
    }

    try {
      warnings = await this._executeFlow(
        language,
        query,
        args,
        outputFormat,
        expectedCardinality,
        state,
        inCodec ?? NULL_CODEC,
        outCodec ?? NULL_CODEC,
        ret,
        privilegedMode ? Capabilities.ALL : undefined,
      );
    } catch (e) {
      if (e instanceof errors.ParameterTypeMismatchError) {
        [card, inCodec, outCodec] = this.queryCodecCache.get(key)!;
        warnings = await this._executeFlow(
          language,
          query,
          args,
          outputFormat,
          expectedCardinality,
          state,
          inCodec ?? NULL_CODEC,
          outCodec ?? NULL_CODEC,
          ret,
          privilegedMode ? Capabilities.ALL : undefined,
        );
      } else {
        throw e;
      }
    }

    if (outputFormat === OutputFormat.NONE) {
      return { result: null, warnings };
    }
    if (expectOne) {
      if (requiredOne && !ret.length) {
        throw new errors.NoDataError("query returned no data");
      } else {
        return { result: ret[0] ?? (asJson ? "null" : null), warnings };
      }
    } else {
      if (ret && ret.length) {
        if (asJson) {
          return { result: ret[0], warnings };
        } else {
          return { result: ret, warnings };
        }
      } else {
        if (asJson) {
          return { result: "[]", warnings };
        } else {
          return { result: ret, warnings };
        }
      }
    }
  }

  getQueryCapabilities(
    query: string,
    outputFormat: OutputFormat,
    expectedCardinality: Cardinality,
  ): number | null {
    const key = this._getQueryCacheKey(
      query,
      outputFormat,
      expectedCardinality,
    );
    return this.queryCodecCache.get(key)?.[3] ?? null;
  }

  async resetState(): Promise<void> {
    if (
      this.connected &&
      this.serverXactStatus !== TransactionStatus.TRANS_IDLE
    ) {
      try {
        await this.fetch(
          `rollback`,
          undefined,
          OutputFormat.NONE,
          Cardinality.NO_RESULT,
          Options.defaults(),
          true,
        );
      } catch {
        this._abortWithError(
          new errors.ClientConnectionClosedError("failed to reset state"),
        );
      }
    }
  }

  protected _abort(): void {
    this.connected = false;
    this._abortWaiters(this.getConnAbortError());
    if (!this.connAbortWaiter.done) {
      this.connAbortWaiter.set();
    }
  }

  isClosed(): boolean {
    return !this.connected;
  }

  async close(): Promise<void> {
    this._abort();
  }
}
