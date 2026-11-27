import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const v2StaticDirectory = fileURLToPath(new URL("../v2/static/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Exact property values that already have Janus semantic tokens in `:root`.
 * Past mistake: PR #403 search chrome used bare rem/ms instead of these tokens
 * (operator correction; same class as #401's Open Props unification).
 */
const TOKENIZED_DECLARATIONS = [
  {
    pattern: /\bmin-height:\s*2\.75rem\b/,
    token: "--control-size-lg",
  },
  {
    pattern: /\bmin-width:\s*2\.75rem\b/,
    token: "--control-size-lg",
  },
  {
    pattern: /(?<![a-z-])height:\s*2\.75rem\b/,
    token: "--control-size-lg",
  },
  {
    pattern: /(?<![a-z-])width:\s*2\.75rem\b/,
    token: "--control-size-lg",
  },
  {
    pattern: /\bborder-radius:\s*0\.75rem\b/,
    token: "--radius-control",
  },
  {
    pattern: /\bfont-size:\s*0\.875rem\b/,
    token: "--font-size-sm",
  },
  {
    pattern: /\bfont-size:\s*0\.75rem\b/,
    token: "--font-size-0",
  },
  {
    pattern: /\bfont-weight:\s*500\b/,
    token: "--font-weight-medium",
  },
  {
    pattern: /\bfont-weight:\s*600\b/,
    token: "--font-weight-semibold",
  },
  {
    pattern: /\bfont-weight:\s*700\b/,
    token: "--font-weight-bold",
  },
  {
    pattern: /\bletter-spacing:\s*-0\.025em\b/,
    token: "--letter-spacing-tight",
  },
  {
    pattern: /\bscale\(\s*0\.97\s*\)/,
    token: "--press-scale",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b120ms\b/,
    token: "--motion-duration-fast",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b150ms\b/,
    token: "--motion-duration",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b180ms\b/,
    token: "--motion-duration-dialog",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b300ms\b/,
    token: "--motion-duration-nav",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b200ms\b/,
    token: "--duration-motion",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b160ms\b/,
    token: "--duration-enter",
  },
  {
    pattern: /\b(?:transition|animation)[^;]*\b280ms\b/,
    token: "--duration-drawer",
  },
];

function isSkippableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("--") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function violationsForLine(filePath, lineNumber, line) {
  return TOKENIZED_DECLARATIONS.filter((rule) => rule.pattern.test(line)).map(
    (rule) =>
      `${filePath}:${lineNumber}: Use var(${rule.token}) instead of a bare rem/ms literal that already has a Janus semantic token in :root.`,
  );
}

export function checkCssSource(filePath, source) {
  return source
    .split(/\r?\n/)
    .flatMap((line, index) =>
      isSkippableLine(line) ? [] : violationsForLine(filePath, index + 1, line),
    );
}

async function listCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== "vendor")
      .map((entry) => {
        const entryPath = join(directory, entry.name);
        return entry.isDirectory() ? listCssFiles(entryPath) : [entryPath];
      }),
  );
  return nested.flat().filter((filePath) => filePath.endsWith(".css"));
}

async function runChecks() {
  const cssFiles = await listCssFiles(v2StaticDirectory);
  const violations = (
    await Promise.all(
      cssFiles.map(async (filePath) =>
        checkCssSource(relative(repositoryRoot, filePath), await readFile(filePath, "utf8")),
      ),
    )
  ).flat();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runChecks();
}
