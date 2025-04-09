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

create type Document {
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
}, 15_000);

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
    await client.close();
  });

  test("query", async () => {
    client = getClient();
    await client.execute(`
insert Document {
  content := "In the digital dawn, we craft our fate,"
};
insert Document {
  content := "Where circuits hum with relentless pace."
};
insert Document {
  content := "Efficiency, a double-edged tool,"
};
insert Document {
  content := "Promises rest, yet demands more."
};
insert Document {
  content := "The clock ticks on, a silent thief,"
};
insert Document {
  content := "Stealing moments, sowing belief."
};
insert Document {
  content := "In the race for more, we lose the day,"
};
insert Document {
  content := "As leisure fades in the bright glow."
};
insert Document {
  content := "Growth, a hungry beast we feed,"
};
insert Document {
  content := "While time for peace becomes a need."
};
    `);

    await waitFor(
      async () => expect(mockServer.getEmbeddingsRequests().length).toBe(1),
      10_000,
      500,
    );
  }, 25_000);

  test("embedding request", async () => {
    client = getClient({
      tlsSecurity: "insecure",
    });
    const ragClient = createRAGClient(client as any, {
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
