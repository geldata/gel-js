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

export async function handleResponseError(response: Response) {
  const contentType = response.headers.get("content-type");
  let errorMessage: string;

  if (contentType && contentType.includes("application/json")) {
    const json = await response.json();

    errorMessage =
      typeof json === "object" && json != null && "message" in json
        ? json.message
        : `An error occurred: ${json}`;
  } else {
    const bodyText = await response.text();
    errorMessage = bodyText || "An unknown error occurred";
  }
  throw new Error(errorMessage);
}
