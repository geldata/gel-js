/*!
 * This source file is part of the Gel open source project.
 *
 * Copyright 2022-present MagicStack Inc. and the Gel authors.
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

import {
  BaseRawConnection,
  Capabilities,
  type ParseResult,
  PROTO_VER,
  RESTRICTED_CAPABILITIES,
} from "./baseConn";
import { NULL_CODEC } from "./codecs/codecs";
import type { ICodec } from "./codecs/ifaces";
import type { CodecsRegistry } from "./codecs/registry";
import type { NormalizedConnectConfig } from "./conUtils";
import {
  BinaryProtocolError,
  type GelError,
  InternalClientError,
  ProtocolError,
} from "./errors";
import type { HttpSCRAMAuth } from "./httpScram";
import {
  Cardinality,
  type Language,
  OutputFormat,
  type ProtocolVersion,
  type QueryArgs,
  type QueryOptions,
} from "./ifaces";
import type { Options } from "./options";
import { WriteBuffer } from "./primitives/buffer";
import * as chars from "./primitives/chars";
import Event from "./primitives/event";
import {
  type AuthenticatedFetch,
  getAuthenticatedFetch,
  versionEqual,
} from "./utils";

const PROTO_MIME = `application/x.edgedb.v_${PROTO_VER[0]}_${PROTO_VER[1]}.binary'`;
const PROTO_MIME_RE = /application\/x\.edgedb\.v_(\d+)_(\d+)\.binary/;

const STUDIO_CAPABILITIES =
  (RESTRICTED_CAPABILITIES |
    Capabilities.SESSION_CONFIG |
    Capabilities.SET_GLOBAL) >>>
  0;

class BaseFetchConnection extends BaseRawConnection {
  protected authenticatedFetch: AuthenticatedFetch;
  protected abortSignal: AbortSignal | null = null;

  constructor(fetch: AuthenticatedFetch, registry: CodecsRegistry) {
    super(registry);
    this.authenticatedFetch = fetch;
  }

  protected override async _waitForMessage(): Promise<void> {
    if (this.buffer.takeMessage()) {
      return;
    }

    if (this.messageWaiter == null || this.messageWaiter.done) {
      throw new InternalClientError(
        `message waiter was not initialized before waiting for response`,
      );
    }

    await this.messageWaiter.wait();
  }

  protected async __sendData(data: Uint8Array): Promise<void> {
    if (this.buffer.takeMessage()) {
      const mtype = this.buffer.getMessageType();
      throw new InternalClientError(
        `sending request before reading all data of the previous one: ` +
          `${chars.chr(mtype)}`,
      );
    }

    if (this.messageWaiter != null && !this.messageWaiter.done) {
      throw new InternalClientError(
        `sending request before waiting for completion of the previous one`,
      );
    }

    this.messageWaiter = new Event();

    try {
      const resp = await this.authenticatedFetch("", {
        method: "post",
        body: data,
        headers: {
          "Content-Type": PROTO_MIME,
        },
        signal: this.abortSignal,
      });

      if (!resp.ok) {
        throw new ProtocolError(
          `fetch failed with status code ${resp.status}: ${resp.statusText}`,
        );
      }

      const contentType = resp.headers.get("content-type");
      const matchProtoVer = contentType?.match(PROTO_MIME_RE);
      if (matchProtoVer) {
        this.protocolVersion = [+matchProtoVer[1], +matchProtoVer[2]];
      }

      const respData = await resp.arrayBuffer();
      const buf = new Uint8Array(respData);
      try {
        this.buffer.feed(buf);
      } catch (e: any) {
        this.messageWaiter.setError(e);
      }

      if (!this.buffer.takeMessage()) {
        throw new ProtocolError("no binary protocol messages in the response");
      }

      this.messageWaiter.set();
    } catch (e) {
      this.messageWaiter.setError(e);
    } finally {
      this.messageWaiter = null;
    }
  }

  protected override _sendData(data: Uint8Array): void {
    this.__sendData(data);
  }

  override async fetch(...args: Parameters<BaseRawConnection["fetch"]>) {
    // In protocol v3 the format of the parse/execute messages depend on the
    // protocol version. In the fetch conn we don't know the server's supported
    // proto version until after the first message is sent, so the first
    // message may be sent with a format the server doesn't support.
    // As a workaround we just retry sending the message (using the now known
    // proto ver) if the supported protocol version returned by the server is
    // different to the protocol version used to send the message, and this
    // caused a BinaryProtocolError.
    const protoVer = this.protocolVersion;
    try {
      return await super.fetch(...args);
    } catch (err: unknown) {
      if (
        err instanceof BinaryProtocolError &&
        !versionEqual(protoVer, this.protocolVersion)
      ) {
        return await super.fetch(...args);
      }
      throw err;
    }
  }

  static create<T extends typeof BaseFetchConnection>(
    this: T,
    fetch: AuthenticatedFetch,
    registry: CodecsRegistry,
  ): InstanceType<T> {
    const conn = new this(fetch, registry);

    conn.connected = true;
    conn.connWaiter.set();

    return conn as InstanceType<T>;
  }
}

export class AdminUIFetchConnection extends BaseFetchConnection {
  override adminUIMode = true;

  static override create<T extends typeof BaseFetchConnection>(
    this: T,
    fetch: AuthenticatedFetch,
    registry: CodecsRegistry,
    knownServerVersion?: [number, number],
  ): InstanceType<T> {
    const conn = super.create(fetch, registry);

    // This class is only used by the UI, and the UI already knows the version
    // of the server (either it's bundled with the local server, or known from
    // the cloud api). So we can pre set the protocol version we know the
    // server supports, instead of doing the retry strategy of
    // BaseFetchConn.fetch in the raw methods below.
    if (knownServerVersion && knownServerVersion[0] < 6) {
      conn.protocolVersion = [2, 0];
    }

    return conn as InstanceType<T>;
  }

  // These methods are exposed for use by Gel Studio
  public async rawParse(
    language: Language,
    query: string,
    state: Options,
    options?: QueryOptions,
    abortSignal?: AbortSignal | null,
  ): Promise<[ProtocolVersion, ...ParseResult]> {
    this.abortSignal = abortSignal ?? null;

    const result = await this._parse(
      language,
      query,
      OutputFormat.BINARY,
      Cardinality.MANY,
      state,
      STUDIO_CAPABILITIES,
      options,
    );
    return [this.protocolVersion, ...result];
  }

  public async rawExecute(
    language: Language,
    query: string,
    state: Options,
    outCodec?: ICodec,
    options?: QueryOptions,
    inCodec?: ICodec,
    args: QueryArgs = null,
    abortSignal?: AbortSignal | null,
  ): Promise<[Uint8Array, GelError[]]> {
    this.abortSignal = abortSignal ?? null;

    const result = new WriteBuffer();
    const warnings = await this._executeFlow(
      language,
      query,
      args,
      outCodec ? OutputFormat.BINARY : OutputFormat.NONE,
      Cardinality.MANY,
      state,
      inCodec ?? NULL_CODEC,
      outCodec ?? NULL_CODEC,
      result,
      STUDIO_CAPABILITIES,
      options,
    );
    return [result.unwrap(), warnings];
  }
}

export class FetchConnection extends BaseFetchConnection {
  static createConnectWithTimeout(httpSCRAMAuth: HttpSCRAMAuth) {
    return async function connectWithTimeout(
      config: NormalizedConnectConfig,
      registry: CodecsRegistry,
    ) {
      const fetch = await getAuthenticatedFetch(
        config.connectionParams,
        httpSCRAMAuth,
      );

      const conn = new FetchConnection(fetch, registry);

      conn.connected = true;
      conn.connWaiter.set();

      return conn;
    };
  }
}
