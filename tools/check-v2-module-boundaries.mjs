import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const v2Directory = fileURLToPath(new URL("../v2/", import.meta.url));

export function isReferencedAsModule(templateSources, assetPath) {
  const assetConstant = `${assetPath.replaceAll(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_URL`;
  const scriptTags = templateSources.matchAll(/<script\b([^>]*)>/g);

  return Array.from(scriptTags, ([, attributes]) => attributes).some(
    (attributes) =>
      /\btype\s*=\s*["']module["']/.test(attributes) && attributes.includes(`::${assetConstant}`),
  );
}

export function hasModuleSyntax(source) {
  return /^\s*(?:import|export)\s/m.test(source);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

async function checkStaticModules() {
  const [staticFiles, templateFiles] = await Promise.all([
    listFiles(join(v2Directory, "static")),
    listFiles(join(v2Directory, "templates")),
  ]);
  const browserScripts = staticFiles.filter(
    (path) =>
      path.endsWith(".js") && !relative(join(v2Directory, "static"), path).startsWith("vendor/"),
  );
  const templateSources = await Promise.all(templateFiles.map((path) => readFile(path, "utf8")));
  const templateSource = templateSources.join("\n");
  const violations = (
    await Promise.all(
      browserScripts.map(async (path) => {
        const source = await readFile(path, "utf8");
        const assetPath = relative(join(v2Directory, "static"), path);
        return isReferencedAsModule(templateSource, assetPath) || hasModuleSyntax(source)
          ? null
          : path;
      }),
    )
  ).filter(Boolean);

  if (violations.length > 0) {
    console.error(
      `Load every first-party V2 browser JavaScript asset with type="module" or give it ES module imports/exports: ${violations.map((path) => relative(v2Directory, path)).join(", ")}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkStaticModules();
}
