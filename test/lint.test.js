import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, lint } from "../dist/index.js";

const rules = (text, options) =>
  lint(parse(text), options).map((i) => i.rule);

test("flags missing title", () => {
  assert.ok(rules("- [a](https://a.com)\n").includes("missing-title"));
});

test("flags duplicate urls", () => {
  const text =
    "# T\n\n## S\n\n- [a](https://a.com/x)\n- [b](https://a.com/x)\n";
  assert.ok(rules(text).includes("duplicate-url"));
});

test("flags empty sections", () => {
  assert.ok(rules("# T\n\n## Empty\n\n## Full\n\n- [a](https://a.com)\n").includes("empty-section"));
});

test("relative urls error without origin, warn with one", () => {
  const text = "# T\n\n## S\n\n- [a](/docs/a)\n";
  const noOrigin = lint(parse(text)).find((i) => i.rule === "relative-url");
  assert.equal(noOrigin.severity, "error");
  const withOrigin = lint(parse(text), { origin: "https://a.com" }).find(
    (i) => i.rule === "relative-url"
  );
  assert.equal(withOrigin.severity, "warning");
});

test("flags off-origin urls when origin is known", () => {
  const text = "# T\n\n## S\n\n- [a](https://staging.example.com/a)\n";
  const issues = lint(parse(text), { origin: "https://docs.example.com" });
  assert.ok(issues.some((i) => i.rule === "off-origin-url"));
});

test("clean file has no issues", () => {
  const text =
    "# T\n\n> Summary.\n\n## S\n\n- [a](https://a.com/x): desc\n";
  assert.deepEqual(rules(text, { origin: "https://a.com" }), []);
});
