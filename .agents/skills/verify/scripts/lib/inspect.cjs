const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { listOption, readState, requireRunId, stringOption } = require("./paths.cjs");

function parseHeaders(headerList) {
  return Object.fromEntries(
    headerList.map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0) throw new Error(`Invalid --header "${entry}". Expected "Name: Value".`);
      return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
    }),
  );
}

function attachSavedPath(evidenceDirectory, relativePath, payload) {
  if (!relativePath) return payload;
  const outputPath = path.join(evidenceDirectory, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { ...payload, savedTo: outputPath };
}

function buildRequestTarget(state, options, positionals) {
  const target = stringOption(options, "target", "v2");
  const baseUrl = target === "v1" ? state.v1Url : state.v2Url;
  const requestPath = positionals[0] || "/";
  return new URL(requestPath, baseUrl).toString();
}

function buildFetchOptions(options) {
  const body = stringOption(options, "body", "");
  return {
    method: stringOption(options, "method", "GET").toUpperCase(),
    headers: parseHeaders(listOption(options, "header")),
    body: body || undefined,
  };
}

async function httpRequest(options, positionals) {
  const state = readState(requireRunId(options));
  const url = buildRequestTarget(state, options, positionals);
  const fetchOptions = buildFetchOptions(options);
  const response = await fetch(url, fetchOptions);
  const payload = {
    url,
    method: fetchOptions.method,
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
  return attachSavedPath(state.evidenceDirectory, stringOption(options, "save", ""), payload);
}

function assertReadOnlySql(query) {
  const normalized = query.trim().toUpperCase();
  const allowed = ["SELECT ", "PRAGMA ", "WITH "].some((prefix) => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      "Only read-only SELECT, PRAGMA, or WITH queries are permitted by verify-janus db.",
    );
  }
}

function queryDatabase(options, positionals) {
  const runId = requireRunId(options);
  const state = readState(runId);
  const query = positionals[0] || "";
  assertReadOnlySql(query);
  const database = new Database(state.databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = database.prepare(query).all();
    const payload = { runId, databasePath: state.databasePath, query, rowCount: rows.length, rows };
    return attachSavedPath(state.evidenceDirectory, stringOption(options, "save", ""), payload);
  } finally {
    database.close();
  }
}

module.exports = { httpRequest, queryDatabase };
