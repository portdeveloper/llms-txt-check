import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, serialize, links } from "../dist/index.js";

const SAMPLE = `# Example Docs

> Short summary of the project.

Some free-form preamble text.

## Docs

- [Getting started](https://example.com/docs/start): the basics
- [API reference](https://example.com/docs/api)

## Optional

- [Changelog](https://example.com/changelog): release history
`;

test("parses title, summary, sections, links", () => {
  const doc = parse(SAMPLE);
  assert.equal(doc.title, "Example Docs");
  assert.equal(doc.summary, "Short summary of the project.");
  assert.deepEqual(doc.preamble, ["Some free-form preamble text."]);
  assert.equal(doc.sections.length, 2);
  assert.equal(doc.sections[0].name, "Docs");
  assert.equal(doc.sections[0].links.length, 2);
  assert.equal(doc.sections[0].links[0].title, "Getting started");
  assert.equal(doc.sections[0].links[0].url, "https://example.com/docs/start");
  assert.equal(doc.sections[0].links[0].description, "the basics");
  assert.equal(doc.sections[0].links[1].description, undefined);
  assert.equal(links(doc).length, 3);
});

test("records line numbers", () => {
  const doc = parse(SAMPLE);
  assert.equal(doc.sections[0].links[0].line, 9);
});

test("collects malformed link lines", () => {
  const doc = parse("# T\n\n## S\n\n- [broken](\n- [ok](https://a.com/b)\n");
  assert.equal(doc.malformed.length, 1);
  assert.equal(doc.malformed[0].line, 5);
  assert.equal(links(doc).length, 1);
});

test("handles nested brackets in titles", () => {
  const doc = parse("# T\n\n## S\n\n- [Joins [SQL]](https://a.com/joins)\n");
  assert.equal(links(doc).length, 1);
  assert.equal(links(doc)[0].title, "Joins [SQL]");
  assert.equal(doc.malformed.length, 0);
});

test("handles multi-line blockquote summary", () => {
  const doc = parse("# T\n\n> line one\n> line two\n");
  assert.equal(doc.summary, "line one line two");
});

test("links before any section go to an implicit section", () => {
  const doc = parse("# T\n\n- [a](https://a.com)\n");
  assert.equal(doc.sections.length, 1);
  assert.equal(doc.sections[0].name, "");
  assert.equal(links(doc).length, 1);
});

test("serialize round-trips through parse", () => {
  const doc = parse(SAMPLE);
  const doc2 = parse(serialize(doc));
  assert.equal(doc2.title, doc.title);
  assert.equal(doc2.summary, doc.summary);
  assert.deepEqual(
    links(doc2).map((l) => l.url),
    links(doc).map((l) => l.url)
  );
});

test("tolerates empty input", () => {
  const doc = parse("");
  assert.equal(doc.title, undefined);
  assert.equal(links(doc).length, 0);
});
