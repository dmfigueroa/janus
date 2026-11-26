import { z } from "zod";
import {
  parseProviderData,
  ProviderRequestError,
  type ProviderRequestContext,
} from "@/integrations/ProviderRequest.server";
import { serverLogger } from "@/shared/logging/ServerLog.server";

const comicVineStatusSchema = z.object({
  error: z.string(),
});

export function parseComicVineResponse<Schema extends z.ZodTypeAny>(
  payloadSchema: Schema,
  rawData: unknown,
  context: ProviderRequestContext,
): z.output<Schema> {
  const status = parseProviderData(comicVineStatusSchema, rawData, context);
  if (status.error !== "OK") rejectComicVineStatus(status.error, context);
  return parseProviderData(payloadSchema, rawData, context);
}

function rejectComicVineStatus(providerMessage: string, context: ProviderRequestContext): never {
  serverLogger("warn", "provider.response.failed", {
    ...context,
    outcome: "provider_error",
    providerMessage,
  });
  throw new ProviderRequestError();
}
