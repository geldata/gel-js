import { type Client } from "gel";
import { createRAGClient } from "../dist/index.js";
import { getClient, waitFor } from "@repo/test-utils";
import { createMockHttpServer, type MockHttpServer } from "./mockHttpServer";

let mockServer: MockHttpServer;

beforeAll(async () => {
  // Start the mock server
  mockServer = createMockHttpServer();

  const client = getClient();
  await client.ensureConnected();
  try {
    await client.execute(`
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
}, 25_000);

afterAll(async () => {
  // Stop the mock server
  if (mockServer) {
    await mockServer.close();
  }
});

describe("@gel/ai", () => {
  let client: Client;
  beforeEach(() => {
    mockServer.resetRequests();
  });

  afterEach(async () => {
    await client?.close();
  });

  test("RAG query", async () => {
    client = getClient({
      tlsSecurity: "insecure",
    });
    await client.execute(`
insert Astronomy { content := 'Skies on Mars are red' };
insert Astronomy { content := 'Skies on Earth are blue' };
      `);
    await waitFor(async () =>
      expect(mockServer.getEmbeddingsRequests().length).toBe(1),
    );

    const ragClient = createRAGClient(client, {
      model: "text-generation-test",
    }).withContext({
      query: "select Astronomy",
    });

    const result = await ragClient.queryRag({
      prompt: "What color are the skies on Mars?",
    });

    expect(result).toEqual("This is a mock response.");

    const streamedResult = ragClient.streamRag({
      prompt: "What color are the skies on Mars?",
    });

    let streamedResultString = "";
    for await (const message of streamedResult) {
      if (
        message.type === "content_block_start" &&
        message.content_block.type === "text"
      ) {
        streamedResultString += message.content_block.text;
      } else if (
        message.type === "content_block_delta" &&
        message.delta.type === "text_delta"
      ) {
        streamedResultString += message.delta.text;
      }
    }

    expect(streamedResultString).toEqual("This is a mock response.");
  }, 25_000);

  test("embedding request", async () => {
    client = getClient({
      tlsSecurity: "insecure",
    });
    const ragClient = createRAGClient(client, {
      model: "text-generation-test",
    });

    const result = await ragClient.generateEmbeddings({
      inputs: ["beep boop!"],
      model: "text-embedding-test",
    });

    await waitFor(
      async () => expect(mockServer.getEmbeddingsRequests().length).toBe(1),
      10_000,
      500,
    );

    expect(result).toEqual(
      // The number of occurences of the first ten letters of the alphabet.
      // two 'b's and two 'e's.
      [0, 2, 0, 0, 2, 0, 0, 0, 0, 0],
    );
  });
});
