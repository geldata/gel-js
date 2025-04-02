import type { Client } from "gel";
import { EventSourceParserStream } from "eventsource-parser/stream";

import {
  getAuthenticatedFetch,
  type AuthenticatedFetch,
} from "gel/dist/utils.js";
import {
  type RAGOptions,
  type QueryContext,
  type StreamingMessage,
  type RagRequest,
  type EmbeddingRequest,
  isPromptRequest,
} from "./types.js";
import { getHTTPSCRAMAuth } from "gel/dist/httpScram.js";
import { cryptoUtils } from "gel/dist/browserCrypto.js";
import { extractMessageFromParsedEvent, handleResponseError } from "./utils.js";

export function createRAGClient(client: Client, options: RAGOptions) {
  return new RAGClient(client, options);
}

const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

export class RAGClient {
  /** @internal */
  private readonly authenticatedFetch: Promise<AuthenticatedFetch>;
  private readonly options: RAGOptions;
  private readonly context: QueryContext;

  /** @internal */
  constructor(
    public readonly client: Client,
    options: RAGOptions,
    context: Partial<QueryContext> = {},
  ) {
    this.authenticatedFetch = RAGClient.getAuthenticatedFetch(client);
    this.options = options;
    this.context = {
      query: context.query ?? "",
      ...(context.variables && { variables: context.variables }),
      ...(context.globals && { globals: context.globals }),
    };
  }

  private static async getAuthenticatedFetch(client: Client) {
    const connectConfig = await client.resolveConnectionParams();

    return getAuthenticatedFetch(connectConfig, httpSCRAMAuth, "ext/ai/");
  }

  withConfig(options: Partial<RAGOptions>) {
    return new RAGClient(
      this.client,
      { ...this.options, ...options },
      this.context,
    );
  }

  withContext(context: Partial<QueryContext>) {
    return new RAGClient(this.client, this.options, {
      ...this.context,
      ...context,
    });
  }

  private async fetchRag(request: RagRequest, context: QueryContext) {
    const headers = request.stream
      ? { Accept: "text/event-stream", "Content-Type": "application/json" }
      : { Accept: "application/json", "Content-Type": "application/json" };

    if (request.prompt && request.initialMessages)
      throw new Error(
        "You can provide either a prompt or a messages array, not both.",
      );

    const messages = isPromptRequest(request)
      ? [
          {
            role: "user" as const,
            content: [{ type: "text", text: request.prompt }],
          },
        ]
      : request.messages ?? [];

    const providedPrompt =
      this.options.prompt &&
      ("name" in this.options.prompt || "id" in this.options.prompt);

    const response = await (
      await this.authenticatedFetch
    )("rag", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...request,
        context,
        model: this.options.model,
        prompt: {
          ...this.options.prompt,
          // if user provides prompt.custom without id/name it is his choice
          // to not include default prompt msgs, but if user provides messages
          // and doesn't provide prompt.custom, since we add messages to the
          // prompt.custom we also have to include default prompt messages
          ...(!this.options.prompt?.custom &&
            !providedPrompt && {
              name: "builtin::rag-default",
            }),
          custom: [...(this.options.prompt?.custom ?? []), ...messages],
        },
        query: [...messages].reverse().find((msg) => msg.role === "user")!
          .content[0].text,
      }),
    });

    if (!response.ok) {
      await handleResponseError(response);
    }

    return response;
  }

  async queryRag(request: RagRequest, context = this.context): Promise<string> {
    const res = await this.fetchRag(
      {
        ...request,
        stream: false,
      },
      context,
    );

    if (!res.headers.get("content-type")?.includes("application/json")) {
      throw new Error(
        "Expected response to have content-type: application/json",
      );
    }

    const data: unknown = await res.json();

    return parseResponse(data);
  }

  streamRag(
    request: RagRequest,
    context = this.context,
  ): AsyncIterable<StreamingMessage> & PromiseLike<Response> {
    const fetchRag = this.fetchRag.bind(this);

    return {
      async *[Symbol.asyncIterator]() {
        const res = await fetchRag(
          {
            ...request,
            stream: true,
          },
          context,
        );

        if (!res.body) {
          throw new Error("Expected response to include a body");
        }

        const reader = res.body
          .pipeThrough(new TextDecoderStream())
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
      },
      then<TResult1 = Response, TResult2 = never>(
        /* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
        onfulfilled?:
          | ((value: Response) => TResult1 | PromiseLike<TResult1>)
          | undefined
          | null,
        onrejected?:
          | ((reason: any) => TResult2 | PromiseLike<TResult2>)
          | undefined
          | null,
        /* eslint-enable @typescript-eslint/no-duplicate-type-constituents */
      ): Promise<TResult1 | TResult2> {
        return fetchRag(
          {
            ...request,
            stream: true,
          },
          context,
        ).then(onfulfilled, onrejected);
      },
    };
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<number[]> {
    const response = await (
      await this.authenticatedFetch
    )("embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await handleResponseError(response);
    }

    const data: unknown = await response.json();
    return parseEmbeddingResponse(data);
  }
}

function parseResponse(data: unknown): string {
  if (
    typeof data === "object" &&
    data != null &&
    "response" in data &&
    typeof data.response === "string"
  ) {
    return data.response;
  }

  throw new Error(
    "Expected response to be an object with response key of type string",
  );
}

function parseEmbeddingResponse(responseData: unknown): number[] {
  if (
    typeof responseData === "object" &&
    responseData != null &&
    "data" in responseData &&
    Array.isArray(responseData.data)
  ) {
    const firstItem: unknown = responseData.data[0];
    if (
      typeof firstItem === "object" &&
      firstItem != null &&
      "embedding" in firstItem
    ) {
      return firstItem.embedding as number[];
    }
  }
  throw new Error(
    "Expected response to be an object with data key of type array of objects with embedding key of type number[]",
  );
}
