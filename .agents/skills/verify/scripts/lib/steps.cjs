const fs = require("node:fs");
const path = require("node:path");
const { resolveTarget } = require("./locators.cjs");

function resolveArtifactPath(featureDirectory, filename) {
  fs.mkdirSync(featureDirectory, { recursive: true });
  return path.join(featureDirectory, filename);
}

async function waitForCondition(predicate, timeoutMilliseconds, message) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

function targetOrBody(page, target) {
  return target ? resolveTarget(page, target) : page.locator("body");
}

async function textContains(locator, expected) {
  const content = await locator.textContent();
  return String(content ?? "").includes(expected);
}

async function stepGoto(context, step) {
  const destination = new URL(step.path, context.baseUrl).toString();
  await context.page.goto(destination, { waitUntil: "networkidle" });
  return { url: context.page.url() };
}

async function stepClick(context, step) {
  const locator = resolveTarget(context.page, step.target);
  await locator.waitFor({ state: "visible" });
  await locator.click();
  return { clicked: step.target };
}

async function stepFill(context, step) {
  const locator = resolveTarget(context.page, step.target);
  await locator.waitFor({ state: "visible" });
  await locator.fill(step.value);
  return { filled: step.target, value: step.value };
}

async function stepSelect(context, step) {
  const locator = resolveTarget(context.page, step.target);
  await locator.waitFor({ state: "visible" });
  await locator.selectOption(step.value);
  return { selected: step.target, value: step.value };
}

async function stepPress(context, step) {
  if (step.target) {
    const locator = resolveTarget(context.page, step.target);
    await locator.waitFor({ state: "visible" });
    await locator.focus();
  }
  await context.page.keyboard.press(step.key);
  return { pressed: step.key };
}

async function stepWait(context, step) {
  const state = step.state || "visible";
  await resolveTarget(context.page, step.target).waitFor({ state });
  return { waited: step.target, state };
}

async function stepExpectText(context, step) {
  const locator = targetOrBody(context.page, step.target);
  const label = step.target || "body";
  await waitForCondition(
    () => textContains(locator, step.text),
    step.timeoutMs || 10_000,
    `Timed out waiting for text "${step.text}" in ${label}.`,
  );
  return { matchedText: step.text };
}

async function stepExpectNoText(context, step) {
  const locator = targetOrBody(context.page, step.target);
  const label = step.target || "body";
  await waitForCondition(
    async () => !(await textContains(locator, step.text)),
    step.timeoutMs || 10_000,
    `Timed out waiting for text "${step.text}" to disappear from ${label}.`,
  );
  return { absentText: step.text };
}

async function stepExpectUrl(context, step) {
  await waitForCondition(
    async () => context.page.url().includes(step.contains),
    step.timeoutMs || 10_000,
    `Timed out waiting for URL to include "${step.contains}". Current URL: ${context.page.url()}`,
  );
  return { url: context.page.url() };
}

async function stepAria(context, step) {
  const snapshot = await targetOrBody(context.page, step.target).ariaSnapshot();
  const outputPath = resolveArtifactPath(context.featureDirectory, step.file);
  fs.writeFileSync(outputPath, `${snapshot}\n`);
  context.artifacts.push(outputPath);
  return { artifact: outputPath };
}

async function stepScreenshot(context, step) {
  const outputPath = resolveArtifactPath(context.featureDirectory, step.file);
  await context.page.screenshot({ path: outputPath, fullPage: Boolean(step.fullPage) });
  context.artifacts.push(outputPath);
  return { artifact: outputPath };
}

const stepHandlers = {
  goto: stepGoto,
  click: stepClick,
  fill: stepFill,
  select: stepSelect,
  press: stepPress,
  wait: stepWait,
  expectText: stepExpectText,
  expectNoText: stepExpectNoText,
  expectUrl: stepExpectUrl,
  aria: stepAria,
  screenshot: stepScreenshot,
};

module.exports = { resolveArtifactPath, stepHandlers };
