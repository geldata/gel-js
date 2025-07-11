import { type Client } from "gel";
import { createRAGClient } from "../dist/index.js";
import { getClient, waitFor, getAvailableExtensions } from "@repo/test-utils";
import { type MockHttpServer } from "./mockHttpServer";
import { setupTestEnvironment } from "./test-setup";

const availableExtensions = getAvailableExtensions();

if (availableExtensions.has("ai")) {
  let mockServer: MockHttpServer;

  beforeAll(async () => {
    mockServer = await setupTestEnvironment();
  }, 60_000);

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

      expect(result.content).toEqual("This is a mock response.");

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

    test("OpenAI style function calling", async () => {
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
      mockServer.resetRequests();

      const ragClient = createRAGClient(client, {
        model: "text-generation-test",
      }).withContext({
        query: "select Astronomy",
      });

      const result = await ragClient.queryRag({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is the diameter of Mars?" },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            name: "get_planet_diameter",
            description: "Get the diameter of a given planet.",
            parameters: {
              type: "object",
              properties: {
                planet_name: {
                  type: "string",
                  description: "The name of the planet, e.g. Mars",
                },
              },
              required: ["planet_name"],
            },
          },
        ],
        tool_choice: "auto",
      });

      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls?.[0].function.name).toEqual(
        "get_planet_diameter",
      );
      expect(result.tool_calls?.[0].function.arguments).toEqual(
        '{"planet_name":"Mars"}',
      );
    }, 60_000);
  });
}
