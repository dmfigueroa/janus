#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const blockStart = "<!-- intent-skills:start -->";
const blockEnd = "<!-- intent-skills:end -->";
const taskLine = /^(?<indent>[ \t]*)-\s+task:\s*"(?<value>[^"]+)"\s*$/;
const loadLine = /^(?<indent>[ \t]*)load:\s*"(?<value>[^"]+)"\s*$/;

const isTaskEntry = (entry) => Boolean(entry?.task);
const isLoadEntry = (entry) => Boolean(entry?.load);
const isUnknownEntry = (entry) => [entry?.task, entry?.load].every((value) => !value);
const isMeaningfulLine = ({ text }) => Boolean(text) && !text.startsWith("#") && text !== "skills:";

export function extractSkillMappingBlock(markdown) {
  const startIndex = markdown.indexOf(blockStart);
  const endIndex = markdown.indexOf(blockEnd);
  const isCompleteBlock =
    [startIndex, endIndex].every((index) => index !== -1) && endIndex > startIndex;

  return isCompleteBlock ? markdown.slice(startIndex + blockStart.length, endIndex) : null;
}

function readEntry(lineNumber, line) {
  const groups = [taskLine, loadLine]
    .map((pattern) => pattern.exec(line) || { groups: {} })
    .map((match) => match.groups);

  return {
    lineNumber,
    text: line.trim(),
    indent: groups[0].indent ?? groups[1].indent,
    task: groups[0].value,
    load: groups[1].value,
  };
}

function toMapping(entries, taskEntry) {
  const [loadEntry = null] = [entries[entries.indexOf(taskEntry) + 1]]
    .filter(Boolean)
    .filter(isLoadEntry)
    .filter((entry) => entry.indent.length > taskEntry.indent.length);

  return {
    task: taskEntry.task,
    taskIndent: taskEntry.indent,
    load: loadEntry && loadEntry.load,
    loadEntry,
  };
}

function toUnexpectedContentError({ lineNumber, text }) {
  return `block line ${lineNumber}: unexpected content "${text}"`;
}

function toUnnestedLoadError({ lineNumber }) {
  return `block line ${lineNumber}: load mapping must be indented under its task item`;
}

function toMissingLoadError({ task }) {
  return `"${task}" is missing its indented load mapping`;
}

export function parseSkillMappings(markdown) {
  const block = extractSkillMappingBlock(markdown);

  if (block === null) {
    return { mappings: [], errors: ["missing <!-- intent-skills:start --> block"] };
  }

  const entries = block
    .split("\n")
    .map((line, index) => readEntry(index + 1, line))
    .filter(isMeaningfulLine);
  const mappings = entries.filter(isTaskEntry).map((entry) => toMapping(entries, entry));
  const mappedLoadEntries = new Set(mappings.map((mapping) => mapping.loadEntry));
  const errors = [
    ...entries.filter(isUnknownEntry).map(toUnexpectedContentError),
    ...entries
      .filter(isLoadEntry)
      .filter((entry) => !mappedLoadEntries.has(entry))
      .map(toUnnestedLoadError),
    ...mappings.filter((mapping) => mapping.load === null).map(toMissingLoadError),
  ];

  return { mappings, errors };
}

export function checkSkillMappings(markdown, rootDirectory) {
  const { mappings, errors } = parseSkillMappings(markdown);
  const pathErrors = mappings
    .filter((mapping) => mapping.load !== null)
    .filter((mapping) => !existsSync(resolve(rootDirectory, mapping.load)))
    .map((mapping) => `"${mapping.load}" does not resolve to an existing file`);

  return { mappings, errors: [...errors, ...pathErrors] };
}

function main() {
  const agentFile = process.argv[2] ?? "ARCHITECTURE.md";
  const agentFilePath = resolve(process.cwd(), agentFile);
  const { mappings, errors } = checkSkillMappings(
    readFileSync(agentFilePath, "utf8"),
    dirname(agentFilePath),
  );

  if (errors.length > 0) {
    console.error(`Invalid skill mappings in ${agentFile}:`);
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${mappings.length} skill mappings in ${agentFile}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
