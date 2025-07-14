export type ChatParticipantRole = "system" | "user" | "assistant" | "tool";

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: { type: "text"; text: string }[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

export interface ToolMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export type Prompt =
  | { name: string; custom?: Message[] }
  | { id: string; custom?: Message[] }
  | { custom: Message[] };

export interface RAGOptions {
  model: string;
  prompt?: Prompt;
}

export interface QueryContext {
  query: string;
  variables?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  max_object_count?: number;
}

export interface OpenAIToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
  strict?: boolean;
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: unknown;
}

export type ToolDefinition = OpenAIToolDefinition | AnthropicToolDefinition;

export interface RagRequestPrompt {
  prompt: string;
  [key: string]: unknown;
}

export interface RagRequestMessages {
  messages: Message[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  [key: string]: unknown;
}

export type RagRequest = RagRequestPrompt | RagRequestMessages;

export function isPromptRequest(
  request: RagRequest,
): request is RagRequestPrompt {
  return "prompt" in request;
}

export interface MessageStart {
  type: "message_start";
  message: {
    id: string;
    model: string;
    role: "assistant" | "system" | "user"; //todo check this;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
    } | null;
  };
}

export type ContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool_use";
      id?: string | null;
      name: string;
      args?: Record<string, unknown> | null;
    };

export interface ContentBlockStart {
  type: "content_block_start";
  index: number;
  content_block: ContentBlock;
}

export interface ContentBlockDelta {
  type: "content_block_delta";
  index: number;
  delta:
    | {
        type: "text_delta";
        text: string;
      }
    | {
        type: "tool_call_delta";
        args: string;
      };
  logprobs?: {
    tokens: string[];
    token_logprobs: number[];
    top_logprobs: Record<string, number>[] | null;
  } | null;
}

export interface ContentBlockStop {
  type: "content_block_stop";
  index: number;
}

export interface MessageDelta {
  type: "message_delta";
  delta: {
    stop_reason: string;
  };
  usage?: {
    completion_tokens: number;
  };
}

export interface MessageStop {
  type: "message_stop";
}

export interface MessageError {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

export interface ToolCallChunk {
  type: "tool_call_chunk";
  tool_call_chunk: {
    index: number;
    id?: string;
    type?: "function";
    function: {
      name?: string;
      arguments?: string;
    };
  };
}

export type StreamingMessage =
  | MessageStart
  | ContentBlockStart
  | ContentBlockDelta
  | ContentBlockStop
  | MessageDelta
  | MessageStop
  | MessageError
  | ToolCallChunk;

export interface EmbeddingRequest {
  inputs: string[];
  model: string;
  dimensions?: number;
  user?: string;
}
