import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const v2Directory = fileURLToPath(new URL("../v2/", import.meta.url));

const JS_RULES = [
  {
    pattern: /["']closedBy["']\s+in\b|HTMLDialogElement\.prototype\b/,
    message:
      'Use native <dialog closedby="any"> and commandfor/command="request-close" instead of JS dialog fallbacks.',
  },
  {
    pattern: /\bfetch\s*\(|\bhtmx\.ajax\s*\(|\bXMLHttpRequest\b/,
    message:
      "Use HTMX hx-* attributes for V2 browser HTTP requests instead of fetch, htmx.ajax, or XMLHttpRequest.",
  },
  {
    pattern: /\.(?:add|remove)EventListener\(\s*(?!["'\s])/,
    message:
      'Register DOM listeners explicitly 1-by-1 with string literals (addEventListener("event", handler)) instead of looping over listener tables.',
  },
];

export function checkScriptSource(filePath, source) {
  return JS_RULES.filter((rule) => rule.pattern.test(source)).map(
    (rule) => `${filePath}: ${rule.message}`,
  );
}

export function checkLayoutHtmxConfig(layoutSource) {
  const metaMatch = layoutSource.match(/<meta\b[^>]*name=["']htmx-config["'][^>]*>/);
  const disablesInheritance = Boolean(
    metaMatch && /"disableInheritance"\s*:\s*true/.test(metaMatch[0]),
  );
  if (disablesInheritance) return [];
  return [
    'v2/templates/layout.html: Keep <meta name="htmx-config" content=\'{"disableInheritance":true}\' /> so container hx-* attributes never leak into nested controls.',
  ];
}

function expandIncludes(source, templatesByName, depth = 0) {
  if (depth > 4) return source;
  return source.replaceAll(/\{%\s*include\s+"([^"]+)"\s*%\}/g, (_, includeName) =>
    expandIncludes(templatesByName.get(includeName) ?? "", templatesByName, depth + 1),
  );
}

function extractRefreshOobSelectors(pageSource) {
  const refreshMatch = pageSource.match(/<[^>]*\bid=["']watchlist-refresh["'][^>]*>/);
  if (!refreshMatch) return null;
  const oobMatch = refreshMatch[0].match(/\bhx-select-oob=["']([^"']+)["']/);
  return oobMatch
    ? oobMatch[1]
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean)
    : [];
}

function extractPreRenderedDialogFormIds(markupOutsideMain) {
  const dialogs = Array.from(
    markupOutsideMain.matchAll(/<dialog\b[^>]*>([\s\S]*?)<\/dialog>/g),
    ([, body]) => body,
  );
  return dialogs.flatMap((dialogBody) =>
    Array.from(dialogBody.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g))
      .filter(([, , body]) => body.trim().length > 0)
      .map(([, attributes]) => attributes.match(/\bid=["']([^"']+)["']/)?.[1])
      .filter(Boolean),
  );
}

export function checkRefreshOobCoverage(pageName, templatesByName) {
  const pageSource = templatesByName.get(pageName) ?? "";
  const oobSelectors = extractRefreshOobSelectors(pageSource);
  if (!oobSelectors) return [];
  const outsideMain = expandIncludes(
    pageSource.replace(/<main\b[\s\S]*?<\/main>/g, ""),
    templatesByName,
  );
  const missingIds = extractPreRenderedDialogFormIds(outsideMain).filter(
    (formId) => !oobSelectors.includes(`#${formId}`),
  );
  return missingIds.map(
    (formId) =>
      `v2/templates/${pageName}: Pre-rendered sibling dialog form #${formId} must be listed in #watchlist-refresh hx-select-oob (or loaded on demand as an empty <form id="${formId}"></form> shell).`,
  );
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

async function runChecks() {
  const [staticFiles, templateFiles] = await Promise.all([
    listFiles(join(v2Directory, "static")),
    listFiles(join(v2Directory, "templates")),
  ]);
  const scriptFiles = staticFiles.filter(
    (filePath) =>
      filePath.endsWith(".js") &&
      !relative(join(v2Directory, "static"), filePath).startsWith("vendor/"),
  );
  const scriptViolations = (
    await Promise.all(
      scriptFiles.map(async (filePath) =>
        checkScriptSource(relative(v2Directory, filePath), await readFile(filePath, "utf8")),
      ),
    )
  ).flat();

  const templateEntries = await Promise.all(
    templateFiles.map(async (filePath) => [
      relative(join(v2Directory, "templates"), filePath),
      await readFile(filePath, "utf8"),
    ]),
  );
  const templatesByName = new Map(templateEntries);
  const layoutViolations = checkLayoutHtmxConfig(templatesByName.get("layout.html") ?? "");
  const refreshViolations = Array.from(templatesByName.keys()).flatMap((templateName) =>
    checkRefreshOobCoverage(templateName, templatesByName),
  );

  const violations = [...scriptViolations, ...layoutViolations, ...refreshViolations];
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runChecks();
}
