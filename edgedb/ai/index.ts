import {
  GelMessage,
  GelSystemMessage,
  GelUserMessage,
  GelAssistantMessage,
  GelToolMessage,
} from "@gel/ai";

export * from "@gel/ai";

export type EdgeDBSystemMessage = GelSystemMessage;
export type EdgeDBUserMessage = GelUserMessage;
export type EdgeDBAssistantMessage = GelAssistantMessage;
export type EdgeDBToolMessage = GelToolMessage;
export type EdgeDBMessage = GelMessage;
