import type { LlmsTxtDocument } from "./parse.js";
import { links } from "./parse.js";

export type Severity = "error" | "warning";

export interface LintIssue {
  rule: string;
  severity: Severity;
  message: string;
  line?: number;
}

export interface LintOptions {
  /** Origin the file is served from, e.g. "https://docs.example.com". Enables off-origin checks. */
  origin?: string;
}

export function lint(
  doc: LlmsTxtDocument,
  options: LintOptions = {}
): LintIssue[] {
  const issues: LintIssue[] = [];

  // Spec requires an H1, but a title-less file still serves its links
  // (trpc.io, docs.pydantic.dev), so this must not fail CI.
  if (doc.title === undefined) {
    issues.push({
      rule: "missing-title",
      severity: "warning",
      message: "File has no H1 title; the spec requires one as the first line.",
    });
  }

  for (const m of doc.malformed) {
    issues.push({
      rule: "malformed-link",
      severity: "error",
      message: `List item looks like a link but does not parse: ${m.raw.trim()}`,
      line: m.line,
    });
  }

  for (const section of doc.sections) {
    if (section.name && section.links.length === 0) {
      issues.push({
        rule: "empty-section",
        severity: "warning",
        message: `Section "${section.name}" contains no links.`,
        line: section.line,
      });
    }
    if (!section.name && section.links.length > 0) {
      issues.push({
        rule: "orphan-links",
        severity: "warning",
        message: "Links appear before any ## section heading.",
        line: section.line,
      });
    }
  }

  const seen = new Map<string, number>();
  for (const link of links(doc)) {
    if (link.missingColon) {
      issues.push({
        rule: "description-missing-colon",
        severity: "warning",
        message: `Description lacks the spec's ": " separator: ${link.url}`,
        line: link.line,
      });
    }
    const prior = seen.get(link.url);
    if (prior !== undefined) {
      issues.push({
        rule: "duplicate-url",
        severity: "warning",
        message: `URL already listed on line ${prior}: ${link.url}`,
        line: link.line,
      });
    } else {
      seen.set(link.url, link.line);
    }

    if (!/^https?:\/\//.test(link.url)) {
      // VitePress's generator emits relative URLs; resolvable against a
      // known origin, so only fatal when there is nothing to resolve with.
      issues.push({
        rule: "relative-url",
        severity: options.origin ? "warning" : "error",
        message: options.origin
          ? `URL is relative (resolved against ${new URL(options.origin).origin} for checks): ${link.url}`
          : `URL is not absolute and no origin is known: ${link.url}`,
        line: link.line,
      });
      continue;
    }

    if (options.origin) {
      try {
        const expected = new URL(options.origin).origin;
        if (new URL(link.url).origin !== expected) {
          issues.push({
            rule: "off-origin-url",
            severity: "warning",
            message: `URL points off-origin (${link.url}); expected ${new URL(options.origin).origin}`,
            line: link.line,
          });
        }
      } catch {
        // Unparseable URLs already reported by relative-url.
      }
    }
  }

  return issues;
}
