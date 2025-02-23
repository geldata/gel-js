import {
  createRAGClient,
  RAGClient,
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  RAGOptions,
} from "@gel/ai";

export * from "@gel/ai";

export type EdgeDBAI = RAGClient;
export const EdgeDBAI = RAGClient;

export const createAI = createRAGClient;

export type EdgeDBSystemMessage = SystemMessage;
export type EdgeDBUserMessage = UserMessage;
export type EdgeDBAssistantMessage = AssistantMessage;
export type EdgeDBToolMessage = ToolMessage;
export type EdgeDBMessage = Message;
export type AIOptions = RAGOptions;
