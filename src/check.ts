import type { LlmsTxtDocument, LlmsTxtLink } from "./parse.js";
import { links, parse } from "./parse.js";
import { lint, type LintIssue } from "./lint.js";

export interface CheckOptions {
  /** Max concurrent requests. Default 8. */
  concurrency?: number;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Check at most this many URLs, spread across the file. Default: all. */
  sample?: number;
  userAgent?: string;
  /** Bodies smaller than this (in bytes, after trim) are flagged near-empty. Default 100. */
  minBodyBytes?: number;
}

export interface UrlResult {
  url: string;
  title: string;
  line: number;
  status: number | null;
  contentType: string;
  bytes: number;
  /** Empty when the URL is healthy. */
  problems: string[];
}

export interface SiteReport {
  source: string;
  sourceStatus: number | null;
  sourceProblems: string[];
  doc: LlmsTxtDocument | null;
  lint: LintIssue[];
  totalLinks: number;
  checked: UrlResult[];
  failures: UrlResult[];
}

const DEFAULT_UA =
  "llms-txt-check/0.1 (+https://github.com/portdeveloper/llms-txt-check)";
const BODY_CAP = 200_000;

interface FetchResult {
  status: number | null;
  contentType: string;
  body: Uint8Array;
  /** URL after following redirects. */
  finalUrl: string;
  error?: string;
}

async function fetchUrl(
  url: string,
  timeoutMs: number,
  userAgent: string
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: buf.slice(0, BODY_CAP),
      finalUrl: res.url || url,
    };
  } catch (err) {
    return {
      status: null,
      contentType: "",
      body: new Uint8Array(),
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function bodyText(body: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(body);
}

function looksLikeHtmlShell(body: Uint8Array): boolean {
  const head = bodyText(body.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

function classify(
  link: LlmsTxtLink,
  res: FetchResult,
  minBodyBytes: number
): UrlResult {
  const problems: string[] = [];
  const trimmedBytes = bodyText(res.body).trim().length;

  if (res.status === null) {
    problems.push(`fetch-error: ${res.error}`);
  } else if (res.status !== 200) {
    problems.push(`http-${res.status}`);
  } else if (trimmedBytes === 0) {
    problems.push("zero-byte-body");
  } else if (trimmedBytes < minBodyBytes) {
    problems.push(`near-empty-body (${trimmedBytes} bytes)`);
  } else if (link.url.endsWith(".md") && looksLikeHtmlShell(res.body)) {
    problems.push("md-url-serves-html");
  }

  return {
    url: link.url,
    title: link.title,
    line: link.line,
    status: res.status,
    contentType: res.contentType,
    bytes: res.body.length,
    problems,
  };
}

async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index] as T);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function sampleLinks(all: LlmsTxtLink[], sample?: number): LlmsTxtLink[] {
  if (!sample || sample >= all.length) return all;
  const step = all.length / sample;
  const picked: LlmsTxtLink[] = [];
  for (let i = 0; i < sample; i++) {
    picked.push(all[Math.floor(i * step)] as LlmsTxtLink);
  }
  return picked;
}

/** Resolve a user-supplied target to the llms.txt URL to fetch. */
export function resolveSource(target: string): string {
  const url = new URL(target);
  if (url.pathname.endsWith(".txt")) return url.toString();
  const base = url.pathname.replace(/\/$/, "");
  url.pathname = `${base}/llms.txt`;
  return url.toString();
}

export async function checkText(
  text: string,
  source: string,
  options: CheckOptions = {}
): Promise<SiteReport> {
  const doc = parse(text);
  const all = links(doc);
  const picked = sampleLinks(all, options.sample);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  const minBodyBytes = options.minBodyBytes ?? 100;

  const checked = await pool(picked, options.concurrency ?? 8, async (link) => {
    let target = link;
    if (!/^https?:\/\//.test(link.url)) {
      try {
        target = { ...link, url: new URL(link.url, source).toString() };
      } catch {
        // Unresolvable stays as-is and surfaces as a fetch-error.
      }
    }
    return classify(
      target,
      await fetchUrl(target.url, timeoutMs, userAgent),
      minBodyBytes
    );
  });

  return {
    source,
    sourceStatus: 200,
    sourceProblems: [],
    doc,
    lint: lint(doc, { origin: originOf(source) }),
    totalLinks: all.length,
    checked,
    failures: checked.filter((r) => r.problems.length > 0),
  };
}

export async function checkSite(
  target: string,
  options: CheckOptions = {}
): Promise<SiteReport> {
  const source = resolveSource(target);
  const res = await fetchUrl(
    source,
    options.timeoutMs ?? 15_000,
    options.userAgent ?? DEFAULT_UA
  );

  const sourceProblems: string[] = [];
  if (res.status === null) sourceProblems.push(`fetch-error: ${res.error}`);
  else if (res.status !== 200) sourceProblems.push(`http-${res.status}`);
  else if (bodyText(res.body).trim().length === 0)
    sourceProblems.push("zero-byte-body");
  else if (looksLikeHtmlShell(res.body))
    sourceProblems.push("serves-html-not-markdown");

  if (sourceProblems.length > 0) {
    return {
      source,
      sourceStatus: res.status,
      sourceProblems,
      doc: null,
      lint: [],
      totalLinks: 0,
      checked: [],
      failures: [],
    };
  }

  // Lint against the post-redirect origin so a domain migration
  // (bun.sh -> bun.com) doesn't flag every link as off-origin.
  const report = await checkText(bodyText(res.body), res.finalUrl, options);
  report.source = source;
  report.sourceStatus = res.status;
  return report;
}

function originOf(source: string): string | undefined {
  try {
    return new URL(source).origin;
  } catch {
    return undefined;
  }
}
