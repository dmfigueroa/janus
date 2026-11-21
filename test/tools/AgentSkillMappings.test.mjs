import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSkillMappings, parseSkillMappings } from "../../tools/check-agent-skill-mappings.mjs";

function mappingBlock(items) {
  return [
    "<!-- intent-skills:start -->",
    "# Skill mappings",
    "",
    "skills:",
    "",
    ...items,
    "",
    "<!-- intent-skills:end -->",
  ].join("\n");
}

describe("parseSkillMappings", () => {
  it("reads a task and its indented load", () => {
    const markdown = mappingBlock(['- task: "one"', '  load: "skills/one/SKILL.md"']);

    expect(parseSkillMappings(markdown)).toMatchObject({
      mappings: [{ task: "one", taskIndent: "", load: "skills/one/SKILL.md" }],
      errors: [],
    });
  });

  it("reports an unindented load as an error", () => {
    const markdown = mappingBlock(['- task: "one"', 'load: "skills/one/SKILL.md"']);
    const { mappings, errors } = parseSkillMappings(markdown);

    expect(mappings[0].load).toBeNull();
    expect(errors).toContain("block line 7: load mapping must be indented under its task item");
  });

  it("reports a task without a load", () => {
    const markdown = mappingBlock([
      '- task: "one"',
      '- task: "two"',
      '  load: "skills/two/SKILL.md"',
    ]);
    const { errors } = parseSkillMappings(markdown);

    expect(errors).toContain('"one" is missing its indented load mapping');
  });

  it("reports a load without a task", () => {
    const markdown = mappingBlock(['load: "skills/one/SKILL.md"']);
    const { errors } = parseSkillMappings(markdown);

    expect(errors).toContain("block line 6: load mapping must be indented under its task item");
  });

  it("reports a missing block", () => {
    expect(parseSkillMappings("# No mappings here")).toEqual({
      mappings: [],
      errors: ["missing <!-- intent-skills:start --> block"],
    });
  });
});

describe("checkSkillMappings", () => {
  let rootDirectory;

  beforeEach(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), "janus-skill-mappings-"));
  });

  afterEach(() => {
    rmSync(rootDirectory, { recursive: true, force: true });
  });

  it("accepts mappings whose load paths resolve", () => {
    const markdown = mappingBlock(['- task: "one"', '  load: "skills/one/SKILL.md"']);
    writeFileSync(join(rootDirectory, "skills-one.md"), "");
    const resolvedMarkdown = markdown.replace("skills/one/SKILL.md", "skills-one.md");

    expect(checkSkillMappings(resolvedMarkdown, rootDirectory).errors).toEqual([]);
  });

  it("reports load paths that do not resolve", () => {
    const markdown = mappingBlock(['- task: "one"', '  load: "skills/one/SKILL.md"']);

    expect(checkSkillMappings(markdown, rootDirectory).errors).toEqual([
      '"skills/one/SKILL.md" does not resolve to an existing file',
    ]);
  });
});
