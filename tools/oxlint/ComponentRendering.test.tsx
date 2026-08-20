import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const oxlintPath = join(process.cwd(), "node_modules", ".bin", "oxlint");
let fixtureDirectory: string;
let fixtureNumber = 0;

function lint(code: string, rule: string) {
  fixtureNumber += 1;
  const fixturePath = join(fixtureDirectory, `Fixture${fixtureNumber}.tsx`);
  writeFileSync(fixturePath, code);

  const result = spawnSync(
    oxlintPath,
    ["--config", "tools/oxlint/StagedTsx.oxlintrc.json", "-A", "all", "-D", rule, fixturePath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
}

beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "janus-oxlint-"));
});

afterAll(() => {
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

describe("no-call-expression-children", () => {
  const rule = "component-rendering/no-call-expression-children";

  it.each([
    ["direct child values", "function Card() { return <div>{label}</div>; }"],
    ["conditional JSX", "function Card() { return <div>{visible && <span>Ready</span>}</div>; }"],
    [
      "calls in JSX attributes",
      "function Card() { return <button title={format(label)}>Ready</button>; }",
    ],
  ])("allows %s", (_name, code) => {
    expect(lint(code, rule)).toMatchObject({ status: 0 });
  });

  it.each([
    ["rendering helpers", "function Card() { return <div>{renderBody()}</div>; }"],
    ["formatting calls", "function Card() { return <div>{format(label)}</div>; }"],
    ["list mapping", "function List() { return <ul>{items.map((item) => <li>{item}</li>)}</ul>; }"],
  ])("rejects %s", (_name, code) => {
    const result = lint(code, rule);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "Render a value or component directly instead of calling a function inside JSX children.",
    );
  });
});

describe("component-owned-jsx", () => {
  const rule = "component-rendering/component-owned-jsx";

  it.each([
    ["direct component returns", "function Card() { return <div>Ready</div>; }"],
    ["implicit component returns", "const Card = () => <div>Ready</div>;"],
    ["nested returned JSX", "function Card() { return <section><div>Ready</div></section>; }"],
    [
      "conditional component returns",
      "function Card() { if (ready) return <div>Ready</div>; return <span>Waiting</span>; }",
    ],
  ])("allows %s", (_name, code) => {
    expect(lint(code, rule)).toMatchObject({ status: 0 });
  });

  it.each([
    [
      "JSX-valued variables",
      "function Card() { const content = <div>Ready</div>; return content; }",
    ],
    ["ordinary helper returns", "function renderCard() { return <div>Ready</div>; }"],
    ["callback returns", "function List() { return <ul>{items.map(() => <li>Item</li>)}</ul>; }"],
  ])("rejects %s", (_name, code) => {
    const result = lint(code, rule);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "Create JSX only in the direct return tree of a named PascalCase component; extract a component instead.",
    );
  });
});
