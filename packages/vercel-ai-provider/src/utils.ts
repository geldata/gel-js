import type { LanguageModelV1FinishReason } from "@ai-sdk/provider";
import type { LanguageModelV1LogProbs } from "@ai-sdk/provider";

export function mapGelStopReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case "stop":
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "length":
    case "model_length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "tool_use":
    case "function_call":
      return "tool-calls";
    // case "content_filter":
    //   return "content-filter";
    default:
      return "unknown";
  }
}

export function getResponseMetadata({
  id,
  model,
  created,
}: {
  id?: string | undefined | null;
  model?: string | undefined | null;
  created?: number | undefined | null;
}) {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp: created != null ? new Date(created * 1000) : undefined,
  };
}

interface OpenAICompletionLogProps {
  tokens: string[];
  token_logprobs: number[];
  top_logprobs: Record<string, number>[] | null;
}

export function mapOpenAICompletionLogProbs(
  logprobs: OpenAICompletionLogProps | null | undefined,
): LanguageModelV1LogProbs | undefined {
  return logprobs?.tokens.map((token, index) => ({
    token,
    logprob: logprobs.token_logprobs[index],
    topLogprobs: logprobs.top_logprobs
      ? Object.entries(logprobs.top_logprobs[index]).map(
          ([token, logprob]) => ({
            token,
            logprob,
          }),
        )
      : [],
  }));
}
