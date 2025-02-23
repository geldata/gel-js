import { type Client, createClient } from "gel";
import { getHTTPSCRAMAuth } from "gel/dist/httpScram.js";
import { cryptoUtils } from "gel/dist/browserCrypto.js";
import { getAuthenticatedFetch } from "gel/dist/utils.js";
import type {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
} from "@ai-sdk/provider";
import { GelChatLanguageModel } from "./gel-chat-language-model.js";
import type { GelChatModelId, GelChatSettings } from "./gel-chat-settings.js";
import { GelEmbeddingModel } from "./gel-embedding-model.js";
import type {
  GelEmbeddingModelId,
  GelEmbeddingSettings,
} from "./gel-embedding-settings.js";

const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

export interface GelProvider extends ProviderV1 {
  (
    modelId: GelChatModelId | GelEmbeddingModelId,
    settings?: GelChatSettings,
  ): LanguageModelV1;

  languageModel(
    modelId: GelChatModelId,
    settings?: GelChatSettings,
  ): GelChatLanguageModel;

  textEmbeddingModel: (
    modelId: GelEmbeddingModelId,
    settings?: GelEmbeddingSettings,
  ) => EmbeddingModelV1<string>;
}

export interface GelProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
   */
  // baseURL?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;
}

export async function createGel(
  client: Client,
  options: GelProviderSettings = {},
): Promise<GelProvider> {
  const connectConfig = await client.resolveConnectionParams();
  // const baseURL = withoutTrailingSlash(options.baseURL) ?? null;

  // In case we want to add more things to this in the future
  const getHeaders = () => ({
    ...options.headers,
  });

  const fetch = await getAuthenticatedFetch(
    connectConfig,
    httpSCRAMAuth,
    "ext/ai/",
  );

  const createChatModel = (
    modelId: GelChatModelId,
    settings: GelChatSettings = {},
  ) =>
    new GelChatLanguageModel(modelId, settings, {
      provider: "gel.chat",
      fetch,
      headers: getHeaders,
    });

  const createEmbeddingModel = (
    modelId: GelEmbeddingModelId,
    settings: GelEmbeddingSettings = {},
  ) => {
    return new GelEmbeddingModel(modelId, settings, {
      provider: "gel.embedding",
      fetch,
      headers: getHeaders,
    });
  };

  const provider = function (
    modelId: GelChatModelId,
    settings?: GelChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        "The Gel model function cannot be called with the new keyword.",
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider;
}

/**
Default provider instance.
 */
export const gel = createGel(createClient());
