import {
  type JSONSchema7,
  type LanguageModelV1,
  type LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import {
  type GelChatModelId,
  isAnthropicModel,
  isOpenAIModel,
} from "./gel-chat-settings.js";

interface OpenAILikeTool {
  type: "function";
  function: {
    name: string;
    description: string | undefined;
    parameters: unknown;
  };
}

interface AnthropicTool {
  name: string;
  description: string | undefined;
  input_schema: JSONSchema7;
}

export function prepareTools(
  mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
    type: "regular";
  },
  model: GelChatModelId,
) {
  const isOpenAI = isOpenAIModel(model);
  const isAnthropic = isAnthropicModel(model);

  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { toolWarnings };
  }

  const gelOpenAILikeTools: OpenAILikeTool[] = [];
  const gelAnthropicTools: AnthropicTool[] = [];

  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        if (isAnthropic) {
          gelAnthropicTools.push({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          });
        } else {
          gelOpenAILikeTools.push({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              // openai
              // strict: structuredOutputs === true ? true : undefined,
            },
          });
        }
        break;
      // add support for anthropic provider tools
      case "provider-defined":
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }

  const toolChoice = mode.toolChoice;
  const gelTools = isAnthropic ? gelAnthropicTools : gelOpenAILikeTools;

  if (toolChoice == null) {
    return {
      tools: gelTools,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case "auto":
      return {
        tools: gelTools,
        tool_choice: isAnthropic ? { type: "auto" } : "auto",
        toolWarnings,
        // add betas to Anthropic in all cases
      };
    case "none":
      return isAnthropic
        ? { toolWarnings }
        : { tools: gelTools, tool_choice: type, toolWarnings };
    case "required":
      return {
        tools: gelTools,
        tool_choice: isAnthropic
          ? { type: "any" }
          : isOpenAI
            ? "required"
            : "any",
        toolWarnings,
      };

    // mistral does not support tool mode directly,
    // so we filter the tools and force the tool choice through 'any'
    case "tool":
      return isAnthropic
        ? {
            tools: gelTools,
            tool_choice: {
              type: "tool",
              name: toolChoice.toolName,
            },
            toolWarnings,
          }
        : isOpenAI
          ? {
              tools: gelTools,
              tool_choice: {
                type: "function",
                function: {
                  name: toolChoice.toolName,
                },
              },
              toolWarnings,
            }
          : {
              tools: (gelTools as OpenAILikeTool[]).filter(
                (tool) => tool.function!.name === toolChoice.toolName,
              ),
              tool_choice: "any",
              toolWarnings,
            };

    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
