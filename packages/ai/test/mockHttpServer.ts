import http from "node:http";
import type { AddressInfo } from "node:net";

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

export function createMockHttpServer(): MockHttpServer {
  let chatCompletionsRequests: RecordedRequest[] = [];
  let embeddingsRequests: RecordedRequest[] = [];
  let otherRequests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    let bodyChunks: Buffer[] = [];
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
    });

    req.on("end", () => {
      const bodyString = Buffer.concat(bodyChunks).toString();
      let parsedBody: any = null;
      try {
        parsedBody = bodyString ? JSON.parse(bodyString) : null;
      } catch (error) {
        console.error("Mock server failed to parse request body:", error);
      }

      const recordedRequest: RecordedRequest = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: parsedBody,
      };

      res.setHeader("Content-Type", "application/json");

      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        console.log(
          `Mock server received /v1/chat/completions request: ${bodyString}`,
        );
        chatCompletionsRequests = [...chatCompletionsRequests, recordedRequest];

        const acceptHeader = req.headers["accept"];
        if (acceptHeader && acceptHeader.includes("text/event-stream")) {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          const completionId = "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798";
          const model = parsedBody.model;
          const created = Math.floor(Date.now() / 1000);
          const finishReason =
            defaultChatCompletionResponse.choices[0].finish_reason;
          const content =
            defaultChatCompletionResponse.choices[0].message.content;
          const contentChunks = content.match(/.{1,50}/g) || []; // Split content into chunks of 50 characters

          res.write(
            `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}",` +
              `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
          );

          contentChunks.forEach((text, index) => {
            res.write(
              `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}",` +
                `"system_fingerprint":null,"choices":[{"index":${index + 1},"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`,
            );
          });

          res.write(
            `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}",` +
              `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}]}\n\n`,
          );

          res.write(
            `data: {"id":"${completionId}","object":"chat.completion.chunk","created":${created},"model":"${model}",` +
              `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}],` +
              `"usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
              `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}\n\n`,
          );

          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(defaultChatCompletionResponse));
        }
      } else if (req.method === "POST" && req.url === "/v1/embeddings") {
        console.log(
          `Mock server received /v1/embeddings request: ${bodyString}`,
        );
        embeddingsRequests = [...embeddingsRequests, recordedRequest];
        if (
          parsedBody &&
          "input" in parsedBody &&
          Array.isArray(parsedBody.input)
        ) {
          const inputs: string[] = parsedBody.input;
          const responseData = inputs.map((input, index) => ({
            object: "embedding",
            index: index,
            // Produce a dummy embedding as the number of occurences of the first ten
            // letters of the alphabet.
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
          res.end(JSON.stringify(response));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid request body" }));
        }
      } else {
        console.log(
          `Mock server received unhandled request: ${req.method} ${req.url}`,
        );
        otherRequests = [...otherRequests, recordedRequest];
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    });
  });

  server.listen(0);

  const address = server.address() as AddressInfo;
  const serverUrl = `http://localhost:${address.port}`;
  console.log(`Mock HTTP server listening on ${serverUrl}`);

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
            console.log(`Mock HTTP server on port ${address.port} closed.`);
            resolve();
          }
        });
      });
    },
  };
}
