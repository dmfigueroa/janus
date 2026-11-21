import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type DestinationStream, type Logger } from "pino";

export type ServerLogContext = {
  requestId: string;
  sessionId?: string;
  transport?: string;
};

export type ServerLogPayload = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[REDACTED]";
const MAX_SANITIZE_DEPTH = 6;

const sensitiveKeyPattern =
  /(authorization|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|token|secret|password|cookie|set-cookie)/i;
const sensitiveQueryParameterPattern =
  /^(api[-_]?key|apikey|key|token|access[-_]?token|refresh[-_]?token|secret|password|sig|signature)$/i;
const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
const authTokenPattern = /((?:Bearer|Basic|Token)\s+)[A-Za-z0-9._~+/=-]+/gi;
const queryParameterPattern =
  /([?&](?:api[-_]?key|apikey|key|token|access[-_]?token|refresh[-_]?token|secret|password|sig|signature)=)[^&\s"'<>]+/gi;

const requestLogContext = new AsyncLocalStorage<ServerLogContext>();

/**
 * Server-side structured logging boundary.
 *
 * Logging stays on the server so provider credentials and request payloads never
 * cross into the browser bundle. Callers pass event names and explicit fields;
 * values are sanitized before emission instead of relying on request bodies.
 */
export function createServerLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "janus" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

let activeLogger = createServerLogger();

/** Replace the active logger. Intended for tests and process-level configuration. */
export function setServerLogger(logger: Logger) {
  activeLogger = logger;
}

export function resetServerLogger() {
  activeLogger = createServerLogger();
}

export function runWithServerLogContext<Result>(
  context: ServerLogContext,
  callback: () => Result,
): Result {
  return requestLogContext.run(context, callback);
}

export function getServerLogContext(): ServerLogContext | undefined {
  return requestLogContext.getStore();
}

export function serverLogger(level: LogLevel, event: string, payload: ServerLogPayload = {}) {
  const context = getServerLogContext();
  const logger = context ? activeLogger.child(context) : activeLogger;
  logger[level](sanitizeLogPayload({ event, ...payload }));
}

function sanitizeLogPayload(payload: ServerLogPayload): ServerLogPayload {
  return sanitizeLogValue(payload) as ServerLogPayload;
}

/** Remove credentials from URLs and sensitive values from structured fields. */
export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  return depth > MAX_SANITIZE_DEPTH ? "[TRUNCATED]" : sanitizeAtDepth(value, depth);
}

function sanitizeAtDepth(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactText(value);
  return sanitizeStructuredValue(value, depth);
}

function sanitizeStructuredValue(value: unknown, depth: number): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  return sanitizeCollection(value, depth);
}

function sanitizeCollection(value: unknown, depth: number): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, depth + 1));
  return isRecord(value) ? sanitizeRecord(value, depth) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function sanitizeRecord(record: Record<string, unknown>, depth: number) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) =>
      sensitiveKeyPattern.test(key) ? [key, REDACTED] : [key, sanitizeLogValue(value, depth + 1)],
    ),
  );
}

/** Serialize an exception into diagnostic fields, redacting credentials first. */
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: redactText(String(error)) };
  }
  return {
    name: error.name,
    message: redactText(error.message),
    ...optionalErrorFields(error),
  };
}

function optionalErrorFields(error: Error) {
  return {
    ...errorCodeField(error),
    ...errorStackField(error),
    ...errorCauseField(error),
  };
}

function errorCodeField(error: Error) {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? { code } : {};
}

function errorStackField(error: Error) {
  return error.stack ? { stack: redactText(error.stack) } : {};
}

function errorCauseField(error: Error) {
  const cause = (error as { cause?: unknown }).cause;
  return cause === undefined ? {} : { cause: sanitizeCause(cause) };
}

function sanitizeCause(cause: unknown) {
  return cause instanceof Error ? serializeError(cause) : redactText(String(cause));
}

function redactText(value: string) {
  return value
    .replace(urlPattern, redactUrl)
    .replace(authTokenPattern, `$1${REDACTED}`)
    .replace(queryParameterPattern, `$1${REDACTED}`);
}

function redactUrl(value: string) {
  try {
    return redactParsedUrl(new URL(value));
  } catch {
    return value;
  }
}

function redactParsedUrl(url: URL) {
  url.searchParams.forEach((_value, key) => redactSearchParameter(url, key));
  redactUrlCredentials(url);
  return url.toString();
}

function redactSearchParameter(url: URL, key: string) {
  if (sensitiveQueryParameterPattern.test(key)) url.searchParams.set(key, REDACTED);
}

function redactUrlCredentials(url: URL) {
  if (url.username) url.username = REDACTED;
  if (url.password) url.password = REDACTED;
}
