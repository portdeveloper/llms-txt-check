/**
 * Parser for llms.txt files per the spec at https://llmstxt.org:
 * an H1 title, an optional blockquote summary, free-form markdown,
 * then H2 sections containing `- [title](url): description` link lists.
 */

export interface LlmsTxtLink {
  title: string;
  url: string;
  description?: string;
  /** 1-indexed line number in the source file. */
  line: number;
}

export interface LlmsTxtSection {
  name: string;
  links: LlmsTxtLink[];
  /** 1-indexed line number of the `##` heading. */
  line: number;
}

export interface LlmsTxtDocument {
  title?: string;
  summary?: string;
  /** Free-form markdown lines between the summary and the first section. */
  preamble: string[];
  sections: LlmsTxtSection[];
  /** List items that look like links but failed to parse. */
  malformed: { raw: string; line: number }[];
}

const LINK_RE = /^[-*]\s+\[(.*)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/;
const LOOKS_LIKE_LINK_RE = /^[-*]\s+.*\]\(/;

export function parse(text: string): LlmsTxtDocument {
  const doc: LlmsTxtDocument = {
    preamble: [],
    sections: [],
    malformed: [],
  };
  const lines = text.split(/\r?\n/);
  let section: LlmsTxtSection | null = null;
  let expectSummary = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    const lineNo = i + 1;

    if (line.startsWith("# ") && doc.title === undefined && !section) {
      doc.title = line.slice(2).trim();
      expectSummary = true;
      continue;
    }

    if (line.startsWith("## ")) {
      section = { name: line.slice(3).trim(), links: [], line: lineNo };
      doc.sections.push(section);
      expectSummary = false;
      continue;
    }

    if (expectSummary && line.startsWith(">")) {
      const part = line.replace(/^>\s?/, "");
      doc.summary = doc.summary ? `${doc.summary} ${part}` : part;
      continue;
    }
    if (expectSummary && line !== "") {
      expectSummary = false;
    }

    const match = line.match(LINK_RE);
    if (match) {
      const link: LlmsTxtLink = {
        title: (match[1] ?? "").trim(),
        url: (match[2] ?? "").trim(),
        line: lineNo,
      };
      const description = (match[3] ?? "").trim();
      if (description) link.description = description;
      if (section) {
        section.links.push(link);
      } else {
        // Links before any section header go into an implicit unnamed section.
        section = { name: "", links: [link], line: lineNo };
        doc.sections.push(section);
      }
      continue;
    }

    if (LOOKS_LIKE_LINK_RE.test(line)) {
      doc.malformed.push({ raw, line: lineNo });
      continue;
    }

    if (!section && line !== "") {
      doc.preamble.push(raw);
    }
  }

  return doc;
}

export function links(doc: LlmsTxtDocument): LlmsTxtLink[] {
  return doc.sections.flatMap((s) => s.links);
}

export function serialize(doc: LlmsTxtDocument): string {
  const out: string[] = [];
  if (doc.title !== undefined) out.push(`# ${doc.title}`, "");
  if (doc.summary !== undefined) out.push(`> ${doc.summary}`, "");
  if (doc.preamble.length) out.push(...doc.preamble, "");
  for (const section of doc.sections) {
    if (section.name) out.push(`## ${section.name}`, "");
    for (const link of section.links) {
      const desc = link.description ? `: ${link.description}` : "";
      out.push(`- [${link.title}](${link.url})${desc}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
