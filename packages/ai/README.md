# @gel/ai

## Installation

You can install the `@gel/ai` package from npm using your favorite package manager.

```bash
npm install @gel/ai
yarn add @gel/ai
pnpm add @gel/ai
```

## Gel Configuration

See the AI documentation for detailed guidance on setting up the AI extension and creating a schema for use with the specialized indexes it includes.

## Example

The following example demonstrates how to use the `@gel/ai` package to query an AI model about astronomy and chemistry.

```typescript
import { createClient } from "gel";
import { createRAGClient } from "@gel/ai";

const client = createClient();

const gpt4Rag = createRAGClient(client, {
  model: "gpt-4-turbo",
});

const astronomyRag = gpt4Rag.withContext({ query: "Astronomy" });

console.time("gpt-4 Time");
console.log(
  (await astronomyRag.queryRag({ prompt: "What color is the sky on Mars?" }))
    .content,
);
console.timeEnd("gpt-4 Time");

const fastAstronomyRag = astronomyRag.withConfig({
  model: "gpt-4o",
});

console.time("gpt-4o Time");
console.log(
  (
    await fastAstronomyRag.queryRag({
      prompt: "What color is the sky on Mars?",
    })
  ).content,
);
console.timeEnd("gpt-4o Time");

const fastChemistryRag = fastAstronomyRag.withContext({ query: "Chemistry" });

console.log(
  (
    await fastChemistryRag.queryRag({
      prompt: "What is the atomic number of gold?",
    })
  ).content,
);

// handle the Response object
const response = await fastChemistryRag.streamRag({
  prompt: "What is the atomic number of gold?",
});
handleReadableStream(response); // custom function that reads the stream

// handle individual chunks as they arrive
for await (const chunk of fastChemistryRag.streamRag({
  prompt: "What is the atomic number of gold?",
})) {
  console.log("chunk", chunk);
}

// embeddings
console.log(
  await fastChemistryRag.generateEmbeddings({
    inputs: ["What is the atomic number of gold?"],
    model: "text-embedding-ada-002",
  }),
);
```

## Tool Calls

The `@gel/ai` package supports tool calls, allowing you to extend the capabilities of the AI model with your own functions. Here's how to use them:

1. **Define your tools**: Create an array of `ToolDefinition` objects that describe your functions, their parameters, and what they do.
2. **Send the request**: Call `queryRag` or `streamRag` with the user's prompt and the `tools` array. You can also use the `tool_choice` parameter to control how the model uses your tools.
3. **Handle the tool call**: If the model decides to use a tool, it will return an `AssistantMessage` with a `tool_calls` array. Your code needs to:
  a. Parse the `tool_calls` array to identify the tool and its arguments.
  b. Execute the tool and get the result.
  c. Create a `ToolMessage` with the result.
  d. Send the `ToolMessage` back to the model in a new request.
4. **Receive the final response**: The model will use the tool's output to generate a final response.

### Example

```typescript
import type {
  Message,
  ToolDefinition,
  UserMessage,
  ToolMessage,
  AssistantMessage,
} from "@gel/ai";

// 1. Define your tools
const tools: ToolDefinition[] = [
  {
    type: "function",
    name: "get_weather",
    description: "Get the current weather for a given city.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The city to get the weather for.",
        },
      },
      required: ["city"],
    },
  },
];

// 2. Send the request
const userMessage: UserMessage = {
  role: "user",
  content: [{ type: "text", text: "What's the weather like in London?" }],
};

const messages: Message[] = [userMessage];

const response = await ragClient.queryRag({
  messages,
  tools,
  tool_choice: "auto",
});

// 3. Handle the tool call
if (response.tool_calls) {
  const toolCall = response.tool_calls[0];
  if (toolCall.function.name === "get_weather") {
    const args = JSON.parse(toolCall.function.arguments);
    const weather = await getWeather(args.city); // Your function to get the weather

    const toolMessage: ToolMessage = {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({ weather }),
    };

    // Add the assistant's response and the tool message to the history
    messages.push(response);
    messages.push(toolMessage);

    // 4. Send the tool result back to the model
    const finalResponse = await ragClient.queryRag({
      messages,
      tools,
    });

    console.log(finalResponse.content);
  }
} else {
  console.log(response.content);
}

// Dummy function for the example
async function getWeather(city: string): Promise<string> {
  return `The weather in ${city} is sunny.`;
}
```

### Streaming Responses

When using `streamRag`, you can handle tool calls as they arrive in the stream. The process is similar to the `queryRag` example, but you'll need to handle the streaming chunks to construct the tool call information.

```typescript
// Function to handle the streaming response
async function handleStreamingResponse(initialMessages: Message[]) {
  const stream = ragClient.streamRag({
    messages: initialMessages,
    tools,
    tool_choice: "auto",
  });

  let toolCalls: { id: string; name: string; arguments: string }[] = [];
  let currentToolCall: { id: string; name: string; arguments: string } | null =
    null;

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_start" &&
      chunk.content_block.type === "tool_use"
    ) {
      currentToolCall = {
        id: chunk.content_block.id!,
        name: chunk.content_block.name,
        arguments: chunk.content_block.args,
      };
    } else if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "tool_call_delta"
    ) {
      if (currentToolCall) {
        currentToolCall.arguments += chunk.delta.args;
      }
    } else if (chunk.type === "content_block_stop") {
      if (currentToolCall) {
        toolCalls.push(currentToolCall);
        currentToolCall = null;
      }
    } else if (chunk.type === "message_stop") {
      // The model has finished its turn
      if (toolCalls.length > 0) {
        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };

        const toolMessages: ToolMessage[] = await Promise.all(
          toolCalls.map(async (tc) => {
            const args = JSON.parse(tc.arguments);
            const weather = await getWeather(args.city); // Your function to get the weather
            return {
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ weather }),
            };
          }),
        );

        const newMessages: Message[] = [
          ...initialMessages,
          assistantMessage,
          ...toolMessages,
        ];

        // Call the function again to get the final response
        await handleStreamingResponse(newMessages);
      }
    } else if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      // Handle text responses from the model
      process.stdout.write(chunk.delta.text);
    }
  }
}

handleStreamingResponse(messages);
```
