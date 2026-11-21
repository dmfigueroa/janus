import { serverLogger } from "@/shared/logging/ServerLog.server";

/** Record a missing provider credential without changing user-facing failures. */
export function logMissingProviderConfiguration(provider: string, operation: string) {
  serverLogger("warn", "provider.configuration.missing", {
    provider,
    operation,
    outcome: "provider_not_configured",
  });
}
