import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ignoredDirectories = new Set([".git", ".output", "dist", "node_modules"]);
const roleOnlyNames = new Set(["Mutation", "Query", "Schema", "Screen", "Types"]);
const suffixes = new Set(["gen", "server", "test"]);
const typescriptExtension = /\.tsx?$/;
const validName = /^(?:[A-Z][A-Za-z0-9]*|use[A-Z][A-Za-z0-9]*)$/;

async function findTypescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  const files = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectories.has(entry.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);

        return entry.isDirectory() ? findTypescriptFiles(entryPath) : [entryPath];
      }),
  );

  return files.flat().filter((file) => typescriptExtension.test(file));
}

function baseName(file) {
  const parts = path.basename(file).replace(typescriptExtension, "").split(".");

  while (suffixes.has(parts.at(-1))) parts.pop();

  return parts.join(".");
}

function isRoute(file) {
  const relativePath = path.relative(process.cwd(), path.resolve(file));

  return relativePath === "src/routes" || relativePath.startsWith(`src/routes${path.sep}`);
}

const requestedFiles = process.argv.slice(2);
const files = requestedFiles.length > 0 ? requestedFiles : await findTypescriptFiles(process.cwd());
const violations = files
  .filter((file) => typescriptExtension.test(file) && !isRoute(file))
  .map((file) => ({ file, name: baseName(file) }))
  .filter(({ name }) => !validName.test(name) || roleOnlyNames.has(name));

if (violations.length > 0) {
  for (const { file, name } of violations) {
    const reason = roleOnlyNames.has(name)
      ? "use a responsibility-based name instead of a generic role"
      : "use PascalCase, or lower camelCase starting with use for a hook";

    console.error(`${path.relative(process.cwd(), file)}: ${reason}`);
  }

  console.error(`\nFound ${violations.length} invalid TypeScript filename(s).`);
  process.exitCode = 1;
}
