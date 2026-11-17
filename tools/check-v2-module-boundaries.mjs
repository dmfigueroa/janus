import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const staticDirectory = fileURLToPath(new URL("../v2/static/", import.meta.url));
const globalClassAssignment = /\bwindow\s*\.\s*[A-Za-z_$][\w$]*\s*=\s*class\b/;

export function findGlobalClassAssignments(source) {
  return globalClassAssignment.test(source);
}

async function checkStaticModules() {
  const files = (await readdir(staticDirectory)).filter((file) => file.endsWith(".js"));
  const violations = (
    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(join(staticDirectory, file), "utf8");
        return findGlobalClassAssignments(source) ? [file] : [];
      }),
    )
  ).flat();

  if (violations.length > 0) {
    console.error(
      `V2 shared classes must use named ES module exports and imports. Replace window class globals in: ${violations.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkStaticModules();
}
