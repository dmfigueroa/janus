import { ProviderRequestError } from "@/integrations/ProviderRequest.server";
import { rejectAdd } from "./AdditionOutcome";

export function providerAdditionFailure(error: unknown, providerName: string) {
  if (!(error instanceof ProviderRequestError)) throw error;
  const message =
    error.code === "provider_not_configured"
      ? `${providerName} additions are unavailable because the integration is not configured.`
      : `${providerName} is temporarily unavailable. Please try again later.`;
  return rejectAdd(message, error.code);
}
