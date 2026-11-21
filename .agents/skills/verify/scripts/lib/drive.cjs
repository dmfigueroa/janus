const fs = require("node:fs");
const path = require("node:path");
const { listOption, readState, repoRoot, requireRunId, stringOption } = require("./paths.cjs");
const { resolveArtifactPath, stepHandlers } = require("./steps.cjs");
const { launchBrowser } = require(path.join(repoRoot, "tools", "playwright-browser.cjs"));

function parseViewport(rawViewport) {
  const [widthText, heightText] = rawViewport.split("x");
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid --viewport "${rawViewport}". Expected WIDTHxHEIGHT such as 1280x800.`);
  }
  return { width, height };
}

function resolveBaseUrl(state, target) {
  const url = target === "v2" ? state.v2Url : state.v1Url;
  if (!url) {
    throw new Error(`Target "${target}" is not running in verification run "${state.runId}".`);
  }
  return url;
}

function readStdinSteps() {
  const stdinContent = fs.readFileSync(0, "utf8").trim();
  if (!stdinContent) {
    throw new Error(
      "Provide steps via --steps-file <path>, repeated --step '<json>', or JSON on stdin.",
    );
  }
  return JSON.parse(stdinContent);
}

function readSteps(options) {
  const stepsFile = stringOption(options, "steps-file", "");
  if (stepsFile) return JSON.parse(fs.readFileSync(stepsFile, "utf8"));
  const inlineSteps = listOption(options, "step");
  return inlineSteps.length > 0 ? inlineSteps.map((entry) => JSON.parse(entry)) : readStdinSteps();
}

async function runSingleStep(context, step, index) {
  const handler = stepHandlers[step.op];
  if (!handler) throw new Error(`Unsupported step op "${step.op}" at step ${index}.`);
  const result = await handler(context, step);
  return { index, op: step.op, url: context.page.url(), result };
}

async function captureFailureArtifacts(context) {
  const screenshotPath = resolveArtifactPath(context.featureDirectory, "failure.png");
  const ariaPath = resolveArtifactPath(context.featureDirectory, "failure.aria.txt");
  await context.page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(ariaPath, `${await context.page.locator("body").ariaSnapshot()}\n`);
  context.artifacts.push(screenshotPath, ariaPath);
}

async function executeSteps(context, steps) {
  const completedSteps = [];
  for (let index = 0; index < steps.length; index += 1) {
    completedSteps.push(await runSingleStep(context, steps[index], index));
  }
  return completedSteps;
}

function writeTranscript(featureDirectory, filename, payload) {
  const transcriptPath = resolveArtifactPath(featureDirectory, filename);
  fs.writeFileSync(transcriptPath, `${JSON.stringify(payload, null, 2)}\n`);
  return transcriptPath;
}

async function drive(options) {
  const runId = requireRunId(options);
  const state = readState(runId);
  const target = stringOption(options, "target", "v1");
  const viewport = parseViewport(stringOption(options, "viewport", "1280x800"));
  const feature = stringOption(options, "feature", "adhoc");
  const evidenceName = stringOption(options, "evidence-name", target);
  const steps = readSteps(options);
  const baseUrl = resolveBaseUrl(state, target);
  const featureDirectory = path.join(state.evidenceDirectory, feature);
  const browser = await launchBrowser("chromium");
  const page = await browser.newPage({ viewport });
  const context = { page, baseUrl, featureDirectory, artifacts: [] };
  try {
    const completedSteps = await executeSteps(context, steps);
    const summary = {
      ok: true,
      runId,
      target,
      baseUrl,
      viewport,
      feature,
      completedSteps,
      artifacts: context.artifacts,
    };
    const transcriptPath = writeTranscript(
      featureDirectory,
      `${evidenceName}.transcript.json`,
      summary,
    );
    return { ...summary, transcriptPath };
  } catch (error) {
    await captureFailureArtifacts(context);
    writeTranscript(featureDirectory, `${evidenceName}.failure.json`, {
      ok: false,
      runId,
      target,
      feature,
      error: error.message,
      artifacts: context.artifacts,
    });
    throw error;
  } finally {
    await page.close();
    await browser.close();
  }
}

module.exports = { drive };
