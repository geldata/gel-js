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

const client = createRAGClient({
  instanceName: "_localdev",
  database: "main",
  tlsSecurity: "insecure",
});

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
