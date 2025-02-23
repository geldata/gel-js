import { z } from "zod";
import type {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1LogProbs,
} from "@ai-sdk/provider";
import {
  type ParseResult,
  type FetchFunction,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  generateId,
  combineHeaders,
} from "@ai-sdk/provider-utils";
import {
  type GelChatModelId,
  type GelChatSettings,
  type GelMessage,
  isAnthropicModel,
} from "./gel-chat-settings.js";
import { gelFailedResponseHandler } from "./gel-error.js";
import {
  mapGelStopReason,
  getResponseMetadata,
  mapOpenAICompletionLogProbs,
} from "./utils.js";
import { convertToGelMessages } from "./convert-to-gel-messages.js";
import { prepareTools } from "./gel-prepare-tools.js";

export interface GelChatConfig {
  provider: string;
  fetch: FetchFunction;
  // baseURL: string | null;
  headers: () => Record<string, string | undefined>;
}

export class GelChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = "v1";
  readonly defaultObjectGenerationMode = "json";
  readonly supportsImageUrls = false;

  readonly modelId: GelChatModelId;
  readonly settings: GelChatSettings;

  private readonly config: GelChatConfig;

  constructor(
    modelId: GelChatModelId,
    settings: GelChatSettings,
    config: GelChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    // it's not really deprecated since the v2 is not out yet that accepts toolChoice, and tools at the top level
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    // providerMetadata: exists in the Vercel SDK d.ts but none of the providers use it
  }: Parameters<LanguageModelV1["doGenerate"]>[0]) {
    const type = mode.type;
    const isAnthropic = isAnthropicModel(this.modelId);

    const warnings: LanguageModelV1CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty",
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty",
      });
    }

    if (stopSequences != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "stopSequences",
      });
    }

    if (isAnthropic && seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed",
      });
    }

    if (!isAnthropic && topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK",
      });
    }

    if (
      (isAnthropic && responseFormat?.type !== "text") ||
      (!isAnthropic &&
        responseFormat?.type === "json" &&
        responseFormat?.schema)
    ) {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format schema is not supported.",
      });
    }

    const baseArgs = {
      model: this.modelId,
      messages: convertToGelMessages(prompt),
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      seed,
      // response_format: ...

      // Mistral only
      safe_prompt: this.settings.safePrompt,

      // Anthropic only
      top_k: topK,

      // OpenAI only
      echo: this.settings.echo,
      logit_bias: this.settings.logitBias,
      logprobs: this.settings.logprobs,
      user: this.settings.user,
    };

    switch (type) {
      case "regular": {
        const { tools, tool_choice, toolWarnings } = prepareTools(
          mode,
          this.modelId,
        );

        return {
          args: {
            ...baseArgs,
            tools,
            tool_choice,
          },
          warnings: [...warnings, ...toolWarnings],
        };
      }

      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: { type: "json_object" },
          },
          warnings,
        };
      }

      // case 'object-tool': {
      // }

      default: {
        throw new Error(`Unsupported type: ${type}`);
      }
    }
  }

  private buildPrompt(messages: GelMessage[]) {
    const providedPromptId =
      this.settings.prompt &&
      ("name" in this.settings.prompt || "id" in this.settings.prompt);

    return {
      ...this.settings.prompt,
      // if user provides prompt.custom without id/name it is his choice
      // to not include default prompt msgs, but if user provides messages
      // and doesn't provide prompt.custom, since we add messages to the
      // prompt.custom we also have to include default prompt messages
      ...(!this.settings.prompt?.custom &&
        !providedPromptId && {
          name: "builtin::rag-default",
        }),
      custom: [...(this.settings.prompt?.custom || []), ...messages],
    };
  }

  private buildQuery(messages: GelMessage[]) {
    return [...messages].reverse().find((msg) => msg.role === "user")!
      .content[0].text;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1["doGenerate"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
    const { args, warnings } = this.getArgs(options);
    const { messages } = args;

    const { responseHeaders, value: response } = await postJsonToApi({
      // url: this.config.baseURL ? `${this.config.baseURL}/rag` : "rag",
      url: "rag",
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        context: this.settings.context,
        prompt: this.buildPrompt(messages),
        query: this.buildQuery(messages),
        stream: false,
      },
      failedResponseHandler: gelFailedResponseHandler,
      successfulResponseHandler:
        createJsonResponseHandler(gelRagResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    const { text, finish_reason, usage, logprobs, tool_calls } = response;

    return {
      text: text ?? undefined,
      toolCalls: tool_calls?.map((toolCall) => ({
        toolCallType: "function",
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.name,
        args: JSON.stringify(toolCall.args),
      })),
      finishReason: mapGelStopReason(finish_reason),
      logprobs: mapOpenAICompletionLogProbs(logprobs),
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      response: getResponseMetadata(response),
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1["doStream"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
    const { args, warnings } = this.getArgs(options);
    const { messages } = args;

    const { responseHeaders, value: response } = await postJsonToApi({
      // url: this.config.baseURL ? `${this.config.baseURL}/rag` : "rag",
      url: "rag",
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        context: this.settings.context,
        prompt: this.buildPrompt(messages),
        query: this.buildQuery(messages),
        stream: true,
      },
      failedResponseHandler: gelFailedResponseHandler,
      successfulResponseHandler:
        createEventSourceResponseHandler(gelRagChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = "unknown";
    let logprobs: LanguageModelV1LogProbs;
    const usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const toolCallContentBlocks: Record<
      number,
      {
        toolCallId: string;
        toolName: string;
        args: string;
      }
    > = {};

    const providerMetadata: LanguageModelV1ProviderMetadata | undefined =
      undefined;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof gelRagChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }

            const value = chunk.value;
            switch (value.type) {
              case "message_start": {
                if (value.message.usage != null) {
                  usage.promptTokens = value.message.usage.prompt_tokens;
                  usage.completionTokens =
                    value.message.usage.completion_tokens;
                }
                controller.enqueue({
                  type: "response-metadata",
                  id: value.message.id ?? undefined,
                  modelId: value.message.model ?? undefined,
                });
                return;
              }

              case "content_block_start": {
                {
                  const contentBlockType = value.content_block.type;

                  switch (contentBlockType) {
                    case "text": {
                      return;
                    }

                    case "tool_use": {
                      toolCallContentBlocks[value.index] = {
                        toolCallId: value.content_block.id || generateId(),
                        toolName: value.content_block.name,
                        args: value.content_block.args ?? "",
                      };
                      return;
                    }

                    default: {
                      const _exhaustiveCheck: never = contentBlockType;
                      throw new Error(
                        `Unsupported content block type: ${_exhaustiveCheck}`,
                      );
                    }
                  }
                }
              }

              case "content_block_stop": {
                // when finishing a tool call block, send the full tool call:
                if (toolCallContentBlocks[value.index] != null) {
                  const contentBlock = toolCallContentBlocks[value.index];

                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: contentBlock.toolCallId,
                    toolName: contentBlock.toolName,
                    args: contentBlock.args,
                  });

                  delete toolCallContentBlocks[value.index];
                }

                return;
              }

              case "content_block_delta": {
                const deltaType = value.delta.type;
                const mappedLogprobs = mapOpenAICompletionLogProbs(
                  value?.logprobs,
                );
                if (mappedLogprobs?.length) {
                  if (logprobs === undefined) logprobs = [];
                  logprobs.push(...mappedLogprobs);
                }

                switch (deltaType) {
                  case "text_delta": {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: value.delta.text,
                    });

                    return;
                  }

                  case "tool_call_delta": {
                    const contentBlock = toolCallContentBlocks[value.index];

                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      argsTextDelta: value.delta.args,
                    });

                    contentBlock.args += value.delta.args;

                    return;
                  }

                  default: {
                    const _exhaustiveCheck: never = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`,
                    );
                  }
                }
              }

              case "message_delta": {
                finishReason = mapGelStopReason(value.delta.stop_reason);
                if (value.usage) {
                  usage.completionTokens = value.usage.completion_tokens;
                }
                return;
              }

              case "message_stop": {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage,
                  logprobs,
                  // can hold things like Antropic cache_creation_input_tokens and cache_read_input_tokens
                  providerMetadata,
                });
                return;
              }

              case "error": {
                controller.enqueue({ type: "error", error: value.error });
                return;
              }

              default: {
                const _exhaustiveCheck: never = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
    };
  }
}

const gelRagResponseSchema = z.object({
  id: z.string().nullish(),
  model: z.string().nullish(),
  created: z.number().nullish(),
  text: z.string().nullish(),
  finish_reason: z.string().nullish(),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
  }),
  logprobs: z
    .object({
      tokens: z.array(z.string()),
      token_logprobs: z.array(z.number()),
      top_logprobs: z.array(z.record(z.string(), z.number())).nullable(),
    })
    .nullish(),
  tool_calls: z
    .array(
      z.object({
        id: z.string().nullish(),
        type: z.literal("function"),
        name: z.string(),
        args: z.unknown(),
      }),
    )
    .nullish(),
});

const gelRagChunkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message_start"),
    message: z.object({
      id: z.string(),
      model: z.string(),
      role: z.enum(["assistant", "system", "user"]),
      usage: z
        .object({
          prompt_tokens: z.number(),
          completion_tokens: z.number(),
        })
        .nullish(),
    }),
  }),
  z.object({
    type: z.literal("content_block_start"),
    index: z.number(),
    content_block: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("text"),
        text: z.string(),
      }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string().nullish(),
        name: z.string(),
        args: z.string().nullish(),
      }),
    ]),
  }),
  z.object({
    type: z.literal("content_block_delta"),
    index: z.number(),
    delta: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("text_delta"),
        text: z.string(),
      }),
      z.object({
        type: z.literal("tool_call_delta"),
        args: z.string(), // partial json
      }),
    ]),
    logprobs: z
      .object({
        tokens: z.array(z.string()),
        token_logprobs: z.array(z.number()),
        top_logprobs: z.array(z.record(z.string(), z.number())).nullable(),
      })
      .nullish(),
  }),
  z.object({
    type: z.literal("content_block_stop"),
    index: z.number(),
  }),
  z.object({
    type: z.literal("message_delta"),
    delta: z.object({ stop_reason: z.string() }),
    usage: z.object({ completion_tokens: z.number() }).nullish(),
  }),
  z.object({
    type: z.literal("message_stop"),
  }),
  // we don't ever return error event from the ext but probably we should
  z.object({
    type: z.literal("error"),
    error: z.object({
      type: z.string(),
      message: z.string(),
    }),
  }),
]);
