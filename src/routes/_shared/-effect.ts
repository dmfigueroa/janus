import { Effect } from "effect";
import { type z } from "zod";
import { getErrorMessage } from "./-utils";

type FetchJsonOptions = {
  url: string | URL;
  init?: RequestInit;
  context: string;
};

async function buildHttpErrorMessage(response: Response, context: string): Promise<string> {
  try {
    const errorBody = await response.json();
    return `${context}: ${response.status} ${response.statusText} ${JSON.stringify(errorBody)}`;
  } catch {
    return `${context}: ${response.status} ${response.statusText}`;
  }
}

export function runServerEffect<A>(effect: Effect.Effect<A, Error>): Promise<A> {
  return Effect.runPromise(effect);
}

export async function runServerHandler<A>(
  effect: Effect.Effect<A, Error>,
  context: string,
): Promise<A> {
  try {
    return await runServerEffect(effect);
  } catch (error) {
    throw new Error(`${context}: ${getErrorMessage(error)}`);
  }
}

export function requireEnvVar(name: string): Effect.Effect<string, Error> {
  return Effect.sync(() => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is not configured`);
    }
    return value;
  });
}

export function fetchJson({ url, init, context }: FetchJsonOptions): Effect.Effect<unknown, Error> {
  return Effect.tryPromise({
    try: async () => {
      const response = init ? await fetch(url.toString(), init) : await fetch(url.toString());
      if (!response.ok) {
        throw new Error(await buildHttpErrorMessage(response, context));
      }
      return response.json();
    },
    catch: (error: unknown) => new Error(`${context}: ${getErrorMessage(error)}`),
  });
}

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  context: string,
): Effect.Effect<z.output<TSchema>, Error> {
  return Effect.try({
    try: () => schema.parse(data),
    catch: (error: unknown) => new Error(`${context}: ${getErrorMessage(error)}`),
  });
}
