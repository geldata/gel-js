# @gel/ai

## Installation

You can install the `@gel/ai` package using npm, yarn, or pnpm. Choose the command corresponding to your package manager:

```bash
npm install @gel/ai
yarn add @gel/ai
pnpm add @gel/ai
```

## Gel Configuration

See the AI documentation for detailed guidance on setting up the AI extension and creating a schema for use with the specialized indexes it includes.

## API Reference

### `createAI(client: Client, options: Partial<AIOptions> = {}): GelAI`

Creates an instance of `GelAI` with the specified client and options.

- `client`: An Gel client instance.
- `options`: Configuration options for the AI model.
  - `model`: Required. Specifies the AI model to use. This could be some of the OpenAI, Mistral or Anthropic models supported by Gel AI.
  - `prompt`: Optional. Defines the input messages for the AI model. The prompt can have an `ID` or a `name` referencing a stored prompt. The referenced prompt will supply predefined messages. Optionally, include a custom list of messages using the `custom` field. These custom messages will be concatenated with messages from the stored prompt referenced by `id` or `name`. If no `id` or `name` is specified, only the `custom` messages will be used. If no `id`, `name`, or `custom` messages are provided, the built-in system prompt will be used by default.

### `GelAI`

#### Public Methods

- `withConfig(options: Partial<AIOptions>): GelAI`

  Returns a new `GelAI` instance with updated configuration options.

- `withContext(context: Partial<QueryContext>): GelAI`

  Returns a new `GelAI` instance with an updated query context.

- `async queryRag(message: string, context?: QueryContext): Promise<string>`

  Sends a query with context to the configured AI model and returns the response as a string.

- `streamRag(message: string, context?: QueryContext): AsyncIterable<StreamingMessage> & PromiseLike<Response>`

  It can be used in two ways:

  - as **an async iterator** - if you want to process streaming data in real-time as it arrives, ideal for handling long-running streams;
  - as **a Promise that resolves to a full Response object** - you have complete control over how you want to handle the stream, this might be useful when you want to manipulate the raw stream or parse it in a custom way.

- `generateEmbeddings(inputs: string[], model: string): Promise<number[]>`

  Generates embeddings for the array of strings.

## Tool Calls

Tool calls are supported by the AI extension. They should be executed on the client side and tool call results should be provided back to the Gel AI.

## Example

The following example demonstrates how to use the `@gel/ai` package to query an AI model about astronomy and chemistry.

```typescript
import { createClient } from "gel";
import { createAI } from "./src/index.js";

const client = createClient({
  instanceName: "_localdev",
  database: "main",
  tlsSecurity: "insecure",
});

const gpt4Ai = createAI(client, {
  model: "gpt-4-turbo-preview",
});

const astronomyAi = gpt4Ai.withContext({ query: "Astronomy" });

console.time("gpt-4 Time");
console.log(await astronomyAi.queryRag("What color is the sky on Mars?"));
console.timeEnd("gpt-4 Time");

const fastAstronomyAi = astronomyAi.withConfig({
  model: "gpt-3.5-turbo",
});

console.time("gpt-3.5 Time");
console.log(await fastAstronomyAi.queryRag("What color is the sky on Mars?"));
console.timeEnd("gpt-3.5 Time");

const fastChemistryAi = fastAstronomyAi.withContext({ query: "Chemistry" });

console.log(
  await fastChemistryAi.queryRag("What is the atomic number of gold?"),
);

// handle the Response object
const response = await fastChemistryAi.streamRag(
  "What is the atomic number of gold?",
);
handleReadableStream(response); // custom function that reads the stream

// handle individual chunks as they arrive
for await (const chunk of fastChemistryAi.streamRag(
  "What is the atomic number of gold?",
)) {
  console.log("chunk", chunk);
}

// embeddings
console.log(
  await fastChemistryAi.generateEmbeddings(
    ["What is the atomic number of gold?"],
    "text-embedding-ada-002",
  ),
);
```
