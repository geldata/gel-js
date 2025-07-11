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
console.log(await astronomyRag.queryRag({ prompt: "What color is the sky on Mars?" }));
console.timeEnd("gpt-4 Time");

const fastAstronomyRag = astronomyRag.withConfig({
  model: "gpt-4o",
});

console.time("gpt-4o Time");
console.log(await fastAstronomyRag.queryRag({ prompt: "What color is the sky on Mars?" }));
console.timeEnd("gpt-4o Time");

const fastChemistryRag = fastAstronomyRag.withContext({ query: "Chemistry" });

console.log(
  await fastChemistryRag.queryRag({ prompt: "What is the atomic number of gold?" }),
);

// handle the Response object
const response = await fastChemistryRag.streamRag(
  { prompt: "What is the atomic number of gold?" },
);
handleReadableStream(response); // custom function that reads the stream

// handle individual chunks as they arrive
for await (const chunk of fastChemistryRag.streamRag(
  { prompt: "What is the atomic number of gold?" },
)) {
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

1.  **Define the tool:** Create a `SystemMessage` that describes the tool, its parameters, and when it should be used.
2.  **Send the request:** Send a request to the model using `queryRag`, including the user's prompt and the tool definition.
3.  **Handle the tool call:** If the model decides to use the tool, it will return an `AssistantMessage` with a `tool_calls` array. Your code needs to:
    a.  Parse the `tool_calls` array to identify the tool and its arguments.
    b.  Execute the tool.
    c.  Create a `ToolMessage` with the result.
    d.  Send the `ToolMessage` back to the model.
4.  **Receive the final response:** The model will use the tool's output to generate a final response.

### Example

```typescript
import type { SystemMessage, UserMessage, ToolMessage, AssistantMessage } from "@gel/ai";

// 1. Define the tool in a system message
const systemMessage: SystemMessage = {
  role: "system",
  content: `
    You have access to a tool called "get_weather" that takes a city as a parameter.
    Use this tool to answer questions about the weather.
    The tool definition is:
    {
      "name": "get_weather",
      "description": "Get the current weather for a given city.",
      "parameters": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "The city to get the weather for."
          }
        },
        "required": ["city"]
      }
    }
  `,
};

// 2. Send the request
const userMessage: UserMessage = {
  role: "user",
  content: [{ type: "text", text: "What's the weather like in London?" }],
};

const response = await ragClient.queryRag({
  messages: [systemMessage, userMessage],
});

// 3. Handle the tool call (this is a simplified example)
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
    });

    console.log(finalResponse.text);
  }
} else {
  console.log(response.text);
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
async function handleStreamingResponse() {
  const stream = ragClient.streamRag({
    messages: [systemMessage, userMessage],
  });

  let toolCallId: string | null = null;
  let functionName: string | null = null;
  let functionArguments = "";
  let assistantResponse: AssistantMessage | null = null;

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
      toolCallId = chunk.content_block.id;
      functionName = chunk.content_block.name;
    } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'tool_call_delta') {
      functionArguments += chunk.delta.args;
    } else if (chunk.type === 'message_stop') {
      // The model has finished its turn
      if (functionName && toolCallId) {
        // We have a tool call to execute
        const args = JSON.parse(functionArguments);
        const weather = await getWeather(args.city); // Your function to get the weather

        const toolMessage: ToolMessage = {
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({ weather }),
        };

        // Add the assistant's response and the tool message to the history
        // A complete assistant message would be constructed from the stream
        assistantResponse = { role: 'assistant', content: '', tool_calls: [{ id: toolCallId, type: 'function', function: { name: functionName, arguments: functionArguments } }] };
        messages.push(assistantResponse);
        messages.push(toolMessage);

        // Reset for the next turn
        toolCallId = null;
        functionName = null;
        functionArguments = "";

        // Call the function again to get the final response
        await handleStreamingResponse();
      }
    } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      // Handle text responses from the model
      process.stdout.write(chunk.delta.text);
    }
  }
}

handleStreamingResponse();
```
