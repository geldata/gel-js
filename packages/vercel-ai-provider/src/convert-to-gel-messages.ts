import { type LanguageModelV1Prompt } from "@ai-sdk/provider";
import type { GelMessage } from "./gel-chat-settings.js";

export function convertToGelMessages(
  prompt: LanguageModelV1Prompt,
): GelMessage[] {
  const messages: GelMessage[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        messages.push({ role: "system", content });
        break;
      }

      case "user": {
        messages.push({
          role: "user",
          content: content.map((part) => {
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              default: {
                throw new Error(`Unsupported type: ${part.type}`);
              }
            }
          }),
        });
        break;
      }

      case "assistant": {
        let text = "";
        const toolCalls: {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }[] = [];

        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args),
                },
              });
              break;
            }

            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });
        break;
      }

      case "tool": {
        for (const toolResponse of content) {
          messages.push({
            role: "tool",
            content: JSON.stringify(toolResponse.result),
            tool_call_id: toolResponse.toolCallId,
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
