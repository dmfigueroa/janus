import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templatesDirectory = fileURLToPath(new URL("../v2/templates/", import.meta.url));
const uiMapPath = fileURLToPath(new URL("../v2/V1-UI-MAP.md", import.meta.url));

/** Templates that are harness-only and have no v1 counterpart by design. */
const ALLOWED_UNMAPPED_TEMPLATES = new Set(["smoke.html"]);

export function checkTemplateCoverage(templateNames, uiMapSource) {
  return templateNames
    .filter((name) => !ALLOWED_UNMAPPED_TEMPLATES.has(name))
    .filter((name) => !uiMapSource.includes(`v2/templates/${name}`))
    .map(
      (name) =>
        `v2/templates/${name}: Add this template to v2/V1-UI-MAP.md (v1 reference + v2 target) before shipping UI, or list it in ALLOWED_UNMAPPED_TEMPLATES if it is harness-only.`,
    );
}

async function runChecks() {
  const [templateNames, uiMapSource] = await Promise.all([
    readdir(templatesDirectory).then((names) => names.filter((name) => name.endsWith(".html"))),
    readFile(uiMapPath, "utf8"),
  ]);
  const violations = checkTemplateCoverage(templateNames, uiMapSource);
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runChecks();
}
