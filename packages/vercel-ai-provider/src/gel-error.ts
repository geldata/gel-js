import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";

const gelErrorDataSchema = z.object({
  object: z.literal("error"),
  message: z.string(),
  type: z.string(),
  param: z.string().nullable(),
  code: z.string().nullable(),
});

export type EdgedDBErrorData = z.infer<typeof gelErrorDataSchema>;

export const gelFailedResponseHandler: ReturnType<
  typeof createJsonErrorResponseHandler
> = createJsonErrorResponseHandler({
  errorSchema: gelErrorDataSchema,
  errorToMessage: (data) => data.message,
});
