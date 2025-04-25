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
import type { ClientConnectionHolder } from "./baseClient";
import type { BaseRawConnection } from "./baseConn";
import * as errors from "./errors";
import {
  type Executor,
  type QueryArgs,
  Cardinality,
  OutputFormat,
  Language,
  type SQLQueryArgs,
} from "./ifaces";
import type { Options } from "./options";
import { IsolationLevel } from "./options";

export enum TransactionState {
  ACTIVE = 0,
  COMMITTED = 1,
  ROLLEDBACK = 2,
  FAILED = 3,
}

export class TransactionImpl {
  protected _holder: ClientConnectionHolder;
  private _rawConn: BaseRawConnection;

  private _state: TransactionState;
  private _opInProgress: boolean;

  private constructor(
    holder: ClientConnectionHolder,
    rawConn: BaseRawConnection,
  ) {
    this._holder = holder;
    this._rawConn = rawConn;

    this._state = TransactionState.ACTIVE;
    this._opInProgress = false;
  }

  /** @internal */
  static async _startTransaction(
    holder: ClientConnectionHolder,
    optimisticRepeatableRead: boolean,
  ): Promise<TransactionImpl> {
    const rawConn = await holder._getConnection();

    await rawConn.resetState();

    const options = holder.options.transactionOptions;
    const txOptions = [];

    if (options.isolation === IsolationLevel.RepeatableRead) {
      txOptions.push(`ISOLATION REPEATABLE READ`);
    } else if (options.isolation === IsolationLevel.Serializable) {
      txOptions.push(`ISOLATION SERIALIZABLE`);
    } else if (options.isolation === IsolationLevel.PreferRepeatableRead) {
      if (optimisticRepeatableRead) {
        txOptions.push(`ISOLATION REPEATABLE READ`);
      } else {
        txOptions.push(`ISOLATION SERIALIZABLE`);
      }
    } else if (options.isolation != null) {
      // If it's `null` we can just issue `START TRANSACTION` and rely on
      // whatever the server defaults to.
      throw new errors.InterfaceError(`Invalid isolation level: ${options.isolation}`);
    }

    if (options.readonly !== undefined) {
      txOptions.push(options.readonly ? "READ ONLY" : "READ WRITE");
    }
    if (options.deferrable !== undefined) {
      txOptions.push(options.deferrable ? "DEFERRABLE" : "NOT DEFERRABLE");
    }
    await rawConn.fetch(
      `START TRANSACTION ${txOptions.join(", ")};`,
      undefined,
      OutputFormat.NONE,
      Cardinality.NO_RESULT,
      holder.options,
      true,
    );

    return new TransactionImpl(holder, rawConn);
  }

  /** @internal */
  async _waitForConnAbort(): Promise<void> {
    await this._rawConn.connAbortWaiter.wait();

    const abortError = this._rawConn.getConnAbortError();
    if (
      abortError instanceof errors.GelError &&
      abortError.cause instanceof errors.TransactionTimeoutError
    ) {
      throw abortError.cause;
    } else {
      throw abortError;
    }
  }

  async _runOp<T>(
    opname: string,
    op: () => Promise<T>,
    errMessage?: string,
  ): Promise<T> {
    if (this._opInProgress) {
      throw new errors.InterfaceError(
        errMessage ??
          "Another query is in progress. Use the query methods " +
            "on 'Client' to run queries concurrently.",
      );
    }
    if (this._state !== TransactionState.ACTIVE) {
      throw new errors.InterfaceError(
        `cannot ${opname}; the transaction is ${
          this._state === TransactionState.COMMITTED
            ? "already committed"
            : this._state === TransactionState.ROLLEDBACK
              ? "already rolled back"
              : "in error state"
        }`,
      );
    }
    this._opInProgress = true;
    try {
      return await op();
    } finally {
      this._opInProgress = false;
    }
  }

  async _runFetchOp(
    opName: string,
    ...args: Parameters<BaseRawConnection["fetch"]>
  ) {
    const { result, warnings } = await this._runOp(opName, () =>
      this._rawConn.fetch(...args),
    );
    if (warnings.length) {
      this._holder.options.warningHandler(warnings);
    }
    return result;
  }

  /** @internal */
  async _commit(): Promise<void> {
    await this._runOp(
      "commit",
      async () => {
        await this._rawConn.fetch(
          "COMMIT",
          undefined,
          OutputFormat.NONE,
          Cardinality.NO_RESULT,
          this._holder.options,
          true,
        );
        this._state = TransactionState.COMMITTED;
      },
      "A query is still in progress after transaction block has returned.",
    );
  }

  /** @internal */
  async _rollback(): Promise<void> {
    await this._runOp(
      "rollback",
      async () => {
        await this._rawConn.fetch(
          "ROLLBACK",
          undefined,
          OutputFormat.NONE,
          Cardinality.NO_RESULT,
          this._holder.options,
          true,
        );
        this._state = TransactionState.ROLLEDBACK;
      },
      "A query is still in progress after transaction block has returned.",
    );
  }
}

export class Transaction implements Executor {
  private impl: TransactionImpl;
  private options: Options;

  constructor(impl: TransactionImpl, options: Options) {
    this.impl = impl;
    this.options = options;
  }

  withSQLRowMode(mode: "array" | "object"): Transaction {
    return new Transaction(this.impl, this.options.withSQLRowMode(mode));
  }

  async execute(query: string, args?: QueryArgs): Promise<void> {
    await this.impl._runFetchOp(
      "execute",
      query,
      args,
      OutputFormat.NONE,
      Cardinality.NO_RESULT,
      this.options,
    );
  }

  async executeSQL(query: string, args?: SQLQueryArgs): Promise<void> {
    await this.impl._runFetchOp(
      "execute",
      query,
      args,
      OutputFormat.NONE,
      Cardinality.NO_RESULT,
      this.options,
      false /* privilegedMode */,
      Language.SQL,
    );
  }

  async query<T = unknown>(query: string, args?: QueryArgs): Promise<T[]> {
    return this.impl._runFetchOp(
      "query",
      query,
      args,
      OutputFormat.BINARY,
      Cardinality.MANY,
      this.options,
    );
  }

  async querySQL<T = unknown>(
    query: string,
    args?: SQLQueryArgs,
  ): Promise<T[]> {
    return this.impl._runFetchOp(
      "query",
      query,
      args,
      OutputFormat.BINARY,
      Cardinality.MANY,
      this.options,
      false /* privilegedMode */,
      Language.SQL,
    );
  }

  async queryJSON(query: string, args?: QueryArgs): Promise<string> {
    return this.impl._runFetchOp(
      "queryJSON",
      query,
      args,
      OutputFormat.JSON,
      Cardinality.MANY,
      this.options,
    );
  }

  async querySingle<T = unknown>(
    query: string,
    args?: QueryArgs,
  ): Promise<T | null> {
    return this.impl._runFetchOp(
      "querySingle",
      query,
      args,
      OutputFormat.BINARY,
      Cardinality.AT_MOST_ONE,
      this.options,
    );
  }

  async querySingleJSON(query: string, args?: QueryArgs): Promise<string> {
    return this.impl._runFetchOp(
      "querySingleJSON",
      query,
      args,
      OutputFormat.JSON,
      Cardinality.AT_MOST_ONE,
      this.options,
    );
  }

  async queryRequired<T = unknown>(
    query: string,
    args?: QueryArgs,
  ): Promise<[T, ...T[]]> {
    return this.impl._runFetchOp(
      "queryRequired",
      query,
      args,
      OutputFormat.BINARY,
      Cardinality.AT_LEAST_ONE,
      this.options,
    );
  }

  async queryRequiredJSON(query: string, args?: QueryArgs): Promise<string> {
    return this.impl._runFetchOp(
      "queryRequiredJSON",
      query,
      args,
      OutputFormat.JSON,
      Cardinality.AT_LEAST_ONE,
      this.options,
    );
  }

  async queryRequiredSingle<T = unknown>(
    query: string,
    args?: QueryArgs,
  ): Promise<T> {
    return this.impl._runFetchOp(
      "queryRequiredSingle",
      query,
      args,
      OutputFormat.BINARY,
      Cardinality.ONE,
      this.options,
    );
  }

  async queryRequiredSingleJSON(
    query: string,
    args?: QueryArgs,
  ): Promise<string> {
    return this.impl._runFetchOp(
      "queryRequiredSingleJSON",
      query,
      args,
      OutputFormat.JSON,
      Cardinality.ONE,
      this.options,
    );
  }
}
