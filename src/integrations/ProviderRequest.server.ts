import ky, { isHTTPError, type Options, type RetryOptions } from "ky";
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

const PROVIDER_REQUEST_TIMEOUT_MS = 5_000;
const PROVIDER_REQUEST_TOTAL_TIMEOUT_MS = 20_000;
const PROVIDER_RETRY_LIMIT = 2;
const PROVIDER_RETRY_BACKOFF_LIMIT_MS = 2_000;
const PROVIDER_RETRY_MAX_AFTER_MS = 5_000;

// Transient statuses only. Ky defaults also retry 413, which is permanent.
// Retry-After is honored for every status we retry.
const PROVIDER_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Shared retry policy for provider reads.
 *
 * Only read methods retry by default. Provider adapters that need to retry a
 * POST must pass an explicit policy override so arbitrary POST requests stay
 * non-retryable.
 */
export const PROVIDER_RETRY_POLICY: RetryOptions = {
  limit: PROVIDER_RETRY_LIMIT,
  methods: ["get", "head"],
  statusCodes: PROVIDER_RETRY_STATUS_CODES,
  afterStatusCodes: PROVIDER_RETRY_STATUS_CODES,
  maxRetryAfter: PROVIDER_RETRY_MAX_AFTER_MS,
  backoffLimit: PROVIDER_RETRY_BACKOFF_LIMIT_MS,
  // Return undefined for HTTP errors so `statusCodes` stays the single source
  // of truth. Any other transport-level failure is transient and safe to retry
  // because mapping and validation run outside the transport.
  shouldRetry: ({ error }) => (isHTTPError(error) ? undefined : true),
};

const providerTransport = ky.create({
  // Resolve fetch at request time so test doubles and runtime polyfills are
  // respected instead of binding the fetch present at module evaluation.
  fetch: (input, init) => globalThis.fetch(input, init),
  timeout: PROVIDER_REQUEST_TIMEOUT_MS,
  totalTimeout: PROVIDER_REQUEST_TOTAL_TIMEOUT_MS,
  retry: PROVIDER_RETRY_POLICY,
  throwHttpErrors: true,
});

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isCancelled(error: unknown, signal?: AbortSignal | null) {
  return isAbortError(error) || signal?.aborted === true;
}

function throwTransportFailure(error: unknown, options?: Options): never {
  // Cancellation is caller intent, not a provider outage. Preserve the
  // original abort reason so callers can distinguish it from a failure.
  if (isCancelled(error, options?.signal)) throw error;
  throw new ProviderRequestError();
}

// Only transport and response failures are expected. Mapping and persistence defects
// must retain their identity instead of being relabeled as a provider outage.
export async function requestProviderJson(
  input: string | URL | Request,
  options?: Options,
): Promise<unknown> {
  try {
    return await providerTransport(input, options).json();
  } catch (error) {
    throwTransportFailure(error, options);
  }
}

export function parseProviderData<Schema extends z.ZodTypeAny>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ProviderRequestError();
  return result.data;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Preserve expected provider failures and caller cancellation while wrapping
 * unexpected mapping defects with the provider label.
 */
export function rethrowProviderFailure(error: unknown, label: string): never {
  if (error instanceof ProviderRequestError || isAbortError(error)) throw error;
  throw new Error(`${label}: ${getErrorMessage(error)}`);
}
