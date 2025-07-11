import { getClient } from "@repo/test-utils";
import { createMockHttpServer, type MockHttpServer } from "./mockHttpServer";

export async function setupTestEnvironment(): Promise<MockHttpServer> {
  const mockServer = createMockHttpServer();

  const client = getClient();
  await client.ensureConnected();
  try {
    await client.execute(`
reset schema to initial;
create extension pgvector;
create extension ai;

create type TestEmbeddingModel extending ext::ai::EmbeddingModel {
  alter annotation ext::ai::model_name := "text-embedding-test";
  alter annotation ext::ai::model_provider := "custom::test";
  alter annotation ext::ai::embedding_model_max_input_tokens := "8191";
  alter annotation ext::ai::embedding_model_max_batch_tokens := "16384";
  alter annotation ext::ai::embedding_model_max_output_dimensions := "10";
  alter annotation ext::ai::embedding_model_supports_shortening := "true";
};

create type TestTextGenerationModel extending ext::ai::TextGenerationModel {
  alter annotation ext::ai::model_name := "text-generation-test";
  alter annotation ext::ai::model_provider := "custom::test";
  alter annotation ext::ai::text_gen_model_context_window := "16385";
};

create type Astronomy {
  create required property content: str;

  create deferred index ext::ai::index(embedding_model := "text-embedding-test") on (.content);
};

configure current branch insert ext::ai::CustomProviderConfig {
    name := "custom::test",
    secret := "dummy-key",
    api_url := "${mockServer.url}/v1",
    api_style := ext::ai::ProviderAPIStyle.OpenAI,
};

configure current branch set ext::ai::Config::indexer_naptime := <duration>"100ms";
    `);
  } finally {
    await client.close();
  }

  return mockServer;
}
