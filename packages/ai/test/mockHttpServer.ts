import http from "node:http";
import type { AddressInfo } from "node:net";
import Debug from "debug";

const debug = Debug("gel:test:ai:mockHttpServer");

export interface RecordedRequest {
  url?: string;
  method?: string;
  headers: http.IncomingHttpHeaders;
  body: any; // Parsed JSON body
}

export interface MockHttpServer {
  server: http.Server;
  url: string;
  port: number;
  getChatCompletionsRequests: () => RecordedRequest[];
  getEmbeddingsRequests: () => RecordedRequest[];
  getOtherRequests: () => RecordedRequest[];
  close: () => Promise<void>;
  resetRequests: () => void;
}

const defaultChatCompletionResponse = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "gpt-3.5-turbo-0125",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "This is a mock response.",
      },
      logprobs: null,
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
  system_fingerprint: "fp_test",
};

const openAIFunctionCallingResponse = {
  id: "chatcmpl-test-fn-calling",
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "gpt-3.5-turbo-0125",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "get_planet_diameter",
              arguments: '{"planet_name":"Mars"}',
            },
          },
        ],
      },
      logprobs: null,
      finish_reason: "tool_calls",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
  system_fingerprint: "fp_test",
};

export function createMockHttpServer(): MockHttpServer {
  let chatCompletionsRequests: RecordedRequest[] = [];
  let embeddingsRequests: RecordedRequest[] = [];
  let otherRequests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    debug("Request received.");
    debug(`Request URL: ${req.url}, Method: ${req.method}`);
    debug("Request headers:", req.headers);

    let bodyChunks: Buffer[] = [];
    req.on("data", (chunk) => {
      debug("Receiving data chunk.");
      bodyChunks.push(chunk);
    });

    req.on("end", () => {
      debug("Request data fully received.");
      const bodyString = Buffer.concat(bodyChunks).toString();
      debug("Request body (raw):", bodyString);
      let parsedBody: any = null;
      try {
        parsedBody = bodyString ? JSON.parse(bodyString) : null;
        debug("Request body (parsed):", parsedBody);
      } catch (error) {
        debug("Failed to parse request body:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to parse request body" }));
        return;
      }

      const recordedRequest: RecordedRequest = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: parsedBody,
      };

      res.setHeader("Content-Type", "application/json");

      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        debug("Handling /v1/chat/completions request.");
        chatCompletionsRequests = [...chatCompletionsRequests, recordedRequest];

        const acceptHeader = req.headers["accept"];
        if (acceptHeader && acceptHeader.includes("text/event-stream")) {
          debug("Handling streaming chat completion.");
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          const completionId = "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798";
          const model = parsedBody.model;
          const created = Math.floor(Date.now() / 1000);

          if (parsedBody.tools) {
            debug("Handling streaming tool calling.");
            const toolCallId = "call_123";
            const functionName = "get_planet_diameter";
            const functionArgs = '{"planet_name":"Mars"}';

            // First chunk: role and tool call metadata
            res.write(
              `data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          index: 0,
                          id: toolCallId,
                          type: "function",
                          function: { name: functionName, arguments: "" },
                        },
                      ],
                    },
                    logprobs: null,
                  },
                ],
              })}

`,
            );

            // Argument chunks
            const argChunks = functionArgs.match(/.{1,10}/g) || [];
            argChunks.forEach((argChunk) => {
              res.write(
                `data: ${JSON.stringify({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            type: "tool_call_delta",
                            function: { arguments: argChunk },
                          },
                        ],
                      },
                    },
                  ],
                })}

`,
              );
            });

            // Final chunk with finish reason
            res.write(
              `data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
              })}

`,
            );

            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          const finishReason =
            defaultChatCompletionResponse.choices[0].finish_reason;
          const content =
            defaultChatCompletionResponse.choices[0].message.content;
          const contentChunks = content.match(/.{1,50}/g) || []; // Split content into chunks of 50 characters

          const firstChunk = `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}","system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":null},"finish_reason":null}]}

`;
          debug("Writing stream chunk:", firstChunk);
          res.write(firstChunk);

          contentChunks.forEach((text, index) => {
            const chunk = `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}","system_fingerprint":null,"choices":[{"index":${index + 1},"delta":{"content":"${text}"},"finish_reason":null}]}

`;
            debug("Writing stream chunk:", chunk);
            res.write(chunk);
          });

          const penultimateChunk = `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}","system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}]}

`;
          debug("Writing stream chunk:", penultimateChunk);
          res.write(penultimateChunk);

          const finalChunkBeforeDone = `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}","system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}],"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}

`;
          debug(
            "Writing stream chunk:",
            finalChunkBeforeDone,
          );
          res.write(finalChunkBeforeDone);

          debug("Writing [DONE] chunk.");
          res.write("data: [DONE]\n\n");
          res.end();
          debug("Stream ended.");
        }
        else {
          debug("Handling non-streaming chat completion.");
          if (parsedBody.tools) {
            debug(
              "'tools' detected, sending function calling response.",
            );
            const responseBody = JSON.stringify(openAIFunctionCallingResponse);
            debug("Response body:", responseBody);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(responseBody);
          } else {
            debug(
              "No 'tools' detected, sending default chat response.",
            );
            const responseBody = JSON.stringify(
              defaultChatCompletionResponse,
            );
            debug("Response body:", responseBody);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(responseBody);
          }
        }
      }
      else if (req.method === "POST" && req.url === "/v1/embeddings") {
        debug("Handling /v1/embeddings request.");
        embeddingsRequests = [...embeddingsRequests, recordedRequest];
        if (
          parsedBody &&
          "input" in parsedBody &&
          Array.isArray(parsedBody.input)
        ) {
          debug("Valid embeddings request body.");
          const inputs: string[] = parsedBody.input;
          const responseData = inputs.map((input, index) => ({
            object: "embedding",
            index: index,
            embedding: Array.from(
              { length: 10 },
              (_, c) => input.split(String.fromCharCode(97 + c)).length - 1,
            ),
          }));
          const response = {
            object: "list",
            data: responseData,
          };
          res.writeHead(200);
          const responseBody = JSON.stringify(response);
          debug("Response body:", responseBody);
          res.end(responseBody);
        } else {
          debug("Invalid embeddings request body.");
          res.writeHead(400);
          const responseBody = JSON.stringify({
            error: "Invalid request body",
          });
          debug("Response body:", responseBody);
          res.end(responseBody);
        }
      }
      else {
        debug(
          `Handling unhandled request: ${req.method} ${req.url}`,
        );
        otherRequests = [...otherRequests, recordedRequest];
        res.writeHead(404);
        const responseBody = JSON.stringify({ error: "Not Found" });
        debug("Response body:", responseBody);
        res.end(responseBody);
      }
    });
  });

  server.listen(0);

  const address = server.address() as AddressInfo;
  const serverUrl = `http://localhost:${address.port}`;
  debug(`HTTP server listening on ${serverUrl}`);

  return {
    server,
    url: serverUrl,
    port: address.port,
    getChatCompletionsRequests: () => chatCompletionsRequests.slice(),
    getEmbeddingsRequests: () => embeddingsRequests.slice(),
    getOtherRequests: () => otherRequests.slice(),
    resetRequests: () => {
      chatCompletionsRequests = [];
      embeddingsRequests = [];
      otherRequests = [];
    },
    close: () => {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            debug(`HTTP server on port ${address.port} closed.`);
            resolve();
          }
        });
      });
    },
  };
}
