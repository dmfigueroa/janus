import assert from "node:assert/strict";
import { isRecord } from "./McpCanonicalize";

const COSMETIC_PREDICATES: Record<string, (value: unknown) => boolean> = {
  $schema: () => true,
  additionalProperties: (value) => value === false,
  required: (value) => Array.isArray(value) && value.length === 0,
};

export function canonicalizeSchema(value: unknown): unknown {
  return canonicalizeSchemaNode(value, value);
}

function canonicalizeSchemaNode(value: unknown, root: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeSchemaNode(entry, root));
  return isRecord(value) ? canonicalizeSchemaObject(value, root) : value;
}

function canonicalizeSchemaObject(
  schema: Record<string, unknown>,
  root: unknown,
): Record<string, unknown> {
  if (typeof schema.$ref === "string") {
    return canonicalizeSchemaNode(resolveJsonPointer(root, schema.$ref), root) as Record<
      string,
      unknown
    >;
  }
  const normalized = normalizeSchemaKeywords(schema);
  const sortedKeys = Object.keys(normalized).sort((left, right) => left.localeCompare(right));
  return Object.fromEntries(
    sortedKeys.map((key) => [key, canonicalizeSchemaNode(normalized[key], root)]),
  );
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  assert.ok(pointer.startsWith("#/"), `Unsupported schema $ref: ${pointer}`);
  return pointer
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => {
      assert.ok(isRecord(current), `Broken schema $ref ${pointer} at ${segment}`);
      return current[segment];
    }, root);
}

function normalizeSchemaKeywords(schema: Record<string, unknown>): Record<string, unknown> {
  const filtered = Object.fromEntries(
    Object.entries(schema).filter(([key, value]) => !isCosmeticSchemaEntry(key, value)),
  );
  return normalizeAnyValueRequired(
    normalizeNullableAnyOf(normalizePositiveIntegerMinimum(filtered)),
  );
}

function normalizePositiveIntegerMinimum(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === "integer" && schema.exclusiveMinimum === 0) {
    const { exclusiveMinimum: _, ...rest } = schema;
    return { ...rest, minimum: 1 };
  }
  return schema;
}

function isCosmeticSchemaEntry(key: string, value: unknown): boolean {
  const predicate = COSMETIC_PREDICATES[key];
  return predicate !== undefined && predicate(value);
}

function normalizeNullableAnyOf(schema: Record<string, unknown>): Record<string, unknown> {
  return isTwoElementArray(schema.anyOf) ? collapseTwoElementUnion(schema, schema.anyOf) : schema;
}

function collapseTwoElementUnion(
  schema: Record<string, unknown>,
  options: unknown[],
): Record<string, unknown> {
  if (isAnyOrNullUnion(options)) {
    const { anyOf: _, ...rest } = schema;
    return rest;
  }
  const types = options.map(simpleTypeName);
  if (types.includes(null)) return schema;
  const { anyOf: _, ...rest } = schema;
  return { ...rest, type: (types as string[]).sort((left, right) => left.localeCompare(right)) };
}

function isAnyOrNullUnion(options: unknown[]): boolean {
  return options.some(isEmptyRecord) && options.some((option) => simpleTypeName(option) === "null");
}

function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

function normalizeAnyValueRequired(schema: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(schema.required) || !isRecord(schema.properties)) return schema;
  const properties = schema.properties;
  const required = (schema.required as string[]).filter(
    (key) => !isUnconstrainedSchema(properties[key]),
  );
  return { ...schema, required };
}

function isUnconstrainedSchema(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 0 || hasAnyOrNullUnion(value);
}

function hasAnyOrNullUnion(value: Record<string, unknown>): boolean {
  return isTwoElementArray(value.anyOf) && isAnyOrNullUnion(value.anyOf);
}

function isTwoElementArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === 2;
}

function simpleTypeName(option: unknown): string | null {
  return isSingleTypeRecord(option) ? stringOrNull(option.type) : null;
}

function isSingleTypeRecord(option: unknown): option is { type: unknown } {
  if (!isRecord(option)) return false;
  const keys = Object.keys(option);
  return keys.length === 1 && keys[0] === "type";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
