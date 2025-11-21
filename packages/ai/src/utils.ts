import type { ParsedEvent } from "eventsource-parser";
import type { StreamingMessage } from "./types.js";

export function extractMessageFromParsedEvent(
  parsedEvent: ParsedEvent,
): StreamingMessage {
  const { data } = parsedEvent;
  if (!data) {
    throw new Error("Expected SSE message to include a data payload");
  }
  return JSON.parse(data) as StreamingMessage;
}

export async function handleResponseError(response: Response): Promise<void> {
  const contentType = response.headers.get("content-type");
  let errorMessage: string;

  if (contentType?.includes("application/json")) {
    const json: unknown = await response.json();

    errorMessage =
      typeof json === "object" &&
      json != null &&
      "message" in json &&
      typeof json.message === "string"
        ? json.message
        : `An error occurred: ${JSON.stringify(json)}`;
  } else {
    const bodyText = await response.text();
    errorMessage = bodyText || "An unknown error occurred";
  }
  throw new Error(`Status: ${response.status}. Message: ${errorMessage}`);
}
