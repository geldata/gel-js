export type GelEmbeddingModelId =
  | "text-embedding-ada-002"
  | "text-embedding-3-small"
  | "text-embedding-3-large"
  | "mistral-embed"
  | (string & {});

export function isMistralEmbeddingModel(model: GelEmbeddingModelId): boolean {
  return model === "mistral-embed";
}

export interface GelEmbeddingSettings {
  /**
Override the maximum number of embeddings per call.
   */
  maxEmbeddingsPerCall?: number;

  /**
Override the parallelism of embedding calls.
   */
  supportsParallelCalls?: boolean;

  // OpenAI only

  /**
The number of dimensions the resulting output embeddings should have.
Only supported in text-embedding-3 and later models.
   */
  dimensions?: number;

  /**
A unique identifier representing your end-user, which can help OpenAI to
monitor and detect abuse.
*/
  user?: string;
}
