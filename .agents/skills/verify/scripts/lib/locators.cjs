function parseRoleTarget(expression) {
  const exact = expression.endsWith(",exact");
  const cleaned = exact ? expression.slice(0, -6) : expression;
  const match = cleaned.match(/^([^,]+)(?:,name=(.*))?$/);
  if (!match) {
    throw new Error(
      `Invalid role target "${expression}". Use "role=<role>,name=<accessible name>".`,
    );
  }
  return { role: match[1].trim(), name: match[2], exact };
}

function resolveRole(scope, expression) {
  const { role, name, exact } = parseRoleTarget(expression);
  if (name === undefined) return scope.getByRole(role).first();
  return scope.getByRole(role, { name, exact }).first();
}

const prefixResolvers = [
  ["role=", resolveRole],
  ["label=", (scope, value) => scope.getByLabel(value).first()],
  ["placeholder=", (scope, value) => scope.getByPlaceholder(value).first()],
  ["text=", (scope, value) => scope.getByText(value, { exact: false }).first()],
  ["css=", (scope, value) => scope.locator(value).first()],
];

function resolveSegment(scope, segment) {
  const trimmed = segment.trim();
  const matched = prefixResolvers.find(([prefix]) => trimmed.startsWith(prefix));
  if (matched) {
    const [prefix, resolver] = matched;
    return resolver(scope, trimmed.slice(prefix.length));
  }
  return scope.locator(trimmed).first();
}

function resolveTarget(page, target) {
  return target.split(" >> ").reduce(resolveSegment, page);
}

module.exports = { resolveTarget };
