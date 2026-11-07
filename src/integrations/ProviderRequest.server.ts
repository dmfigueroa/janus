import { z } from "zod";

export class ProviderRequestError extends Error {
  constructor(
    public readonly code:
      | "provider_unavailable"
      | "provider_not_configured" = "provider_unavailable",
  ) {
    super(
      code === "provider_not_configured"
        ? "Provider is not configured."
        : "Provider request failed.",
    );
    this.name = "ProviderRequestError";
  }
}

// Only transport and response failures are expected. Mapping and persistence defects
// must retain their identity instead of being relabeled as a provider outage.
export async function requestProviderJson(input: string | URL, init?: RequestInit) {
  const response = await fetch(input, init).catch(() => {
    throw new ProviderRequestError();
  });
  if (!response.ok) throw new ProviderRequestError();
  return response.json().catch(() => {
    throw new ProviderRequestError();
  });
}

export function parseProviderData<Schema extends z.ZodTypeAny>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ProviderRequestError();
  return result.data;
}
