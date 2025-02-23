# Provider for the Vercel AI SDK

The provider for the [Vercel AI SDK](https://sdk.vercel.ai/docs) contains
language model support for the OpenAi, Mistral and Anthropic chat and completion
APIs that implements Gel RAG, and embedding model support for the OpenAI and
Mistral embeddings API.

## Setup

Provider is available in the `@gel/vercel-ai-provider` module. You can install
it with:

```bash
npm i @gel/vercel-ai-provider
```

## Provider Instance

You can import the default provider instance `gel` from `@gel/vercel-ai-provider`:

```ts
import { gel } from "@gel/vercel-ai-provider";
```

## Example

```ts
import { generateText } from "ai";
import { createClient } from "gel";
import { gel } from "@gel/vercel-ai-provider";

const textModel = (await gel).languageModel("gpt-4-turbo-preview", {
  context: { query: "your context" },
});

const { text } = await generateText({
  model: textModel,
  prompt: "your prompt",
});

console.log(text);
```

## Documentation

Please check out the **[Gel provider documentation](https://docs.geldata.com/ai/vercel_ai_sdk_provider)** for more information.
