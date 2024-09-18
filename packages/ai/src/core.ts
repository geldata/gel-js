import type { Client } from "edgedb";
import {
  EventSourceParserStream,
  type ParsedEvent,
} from "eventsource-parser/stream";

import type { ResolvedConnectConfig } from "edgedb/dist/conUtils.js";
import {
  getAuthenticatedFetch,
  type AuthenticatedFetch,
} from "edgedb/dist/utils.js";
import type {
  AIOptions,
  QueryContext,
  RAGRequest,
  StreamingMessage,
} from "./types.js";
import { getHTTPSCRAMAuth } from "edgedb/dist/httpScram.js";
import { cryptoUtils } from "edgedb/dist/browserCrypto.js";

export function createAI(client: Client, options: AIOptions) {
  return new EdgeDBAI(client, options);
}

const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

export class EdgeDBAI {
  /** @internal */
  private readonly authenticatedFetch: Promise<AuthenticatedFetch>;
  private readonly options: AIOptions;
  private readonly context: QueryContext;

  /** @internal */
  constructor(
    public readonly client: Client,
    options: AIOptions,
    context: Partial<QueryContext> = {},
  ) {
    this.authenticatedFetch = EdgeDBAI.getAuthenticatedFetch(client);
    this.options = options;
    this.context = {
      query: context.query ?? "",
      ...(context.variables && { variables: context.variables }),
      ...(context.globals && { globals: context.globals }),
    };
  }

  private static async getAuthenticatedFetch(client: Client) {
    const connectConfig: ResolvedConnectConfig = (
      await (client as any).pool._getNormalizedConnectConfig()
    ).connectionParams;

    return getAuthenticatedFetch(connectConfig, httpSCRAMAuth, "ext/ai/");
  }

  withConfig(options: Partial<AIOptions>) {
    return new EdgeDBAI(
      this.client,
      { ...this.options, ...options },
      this.context,
    );
  }

  withContext(context: Partial<QueryContext>) {
    return new EdgeDBAI(this.client, this.options, {
      ...this.context,
      ...context,
    });
  }

  private async fetchRag(request: RAGRequest) {
    const headers = request.stream
      ? { Accept: "text/event-stream", "Content-Type": "application/json" }
      : { Accept: "application/json", "Content-Type": "application/json" };

    const response = await (
      await this.authenticatedFetch
    )("rag", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(bodyText);
    }

    return response;
  }

  async queryRag({
    message,
    context = this.context,
    stream = false,
  }: {
    message: string;
    context?: QueryContext;
    stream?: boolean;
  }): Promise<QueryResponse> {
    const response = await this.fetchRag({
      model: this.options.model,
      prompt: this.options.prompt,
      context,
      query: message,
      stream,
    });

    return new QueryResponse(response, stream);
  }
}

class QueryResponse {
  private readonly res: Response;
  private readonly stream: boolean;

  constructor(response: Response, stream: boolean) {
    this.res = response;
    this.stream = stream;
  }

  async text(): Promise<string> {
    if (!this.stream) {
      const data = await this.res.json();
      return data.response;
    }
    throw new Error("Cannot call `text()` on a streaming request.");
  }

  async response(): Promise<any> {
    if (!this.stream) {
      return this.res;
    }

    if (!this.res.body) {
      throw new Error("Expected response to include a body");
    }

    return new Response(this.res.body, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<
    StreamingMessage,
    void,
    undefined
  > {
    if (!this.stream) {
      throw new Error("Cannot stream results from a non-streaming request.");
    }

    if (!this.res.body) {
      throw new Error("Expected response to include a body");
    }

    const reader = this.res
      .body!.pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const message = extractMessageFromParsedEvent(value);
        yield message;
        if (message.type === "message_stop") break;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function extractMessageFromParsedEvent(
  parsedEvent: ParsedEvent,
): StreamingMessage {
  const { data } = parsedEvent;
  if (!data) {
    throw new Error("Expected SSE message to include a data payload");
  }
  return JSON.parse(data) as StreamingMessage;
}
