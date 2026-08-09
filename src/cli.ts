#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parse } from "./parse.js";
import { lint } from "./lint.js";
import { checkSite, checkText, type SiteReport } from "./check.js";

const HELP = `llms-txt-check - validate llms.txt against the site that serves it

Usage:
  llms-txt-check <url>            Fetch <url>/llms.txt (or the .txt URL directly)
                                 and verify every listed URL actually serves content.
  llms-txt-check <file> --lint    Lint a local llms.txt without network checks.

Options:
  --lint             Lint only, skip URL fetching
  --sample <n>       Check at most n URLs, spread across the file (default: all)
  --concurrency <n>  Parallel requests (default: 8)
  --timeout <ms>     Per-request timeout (default: 15000)
  --json             Machine-readable output
  --help             Show this help

Exit codes: 0 healthy, 1 problems found, 2 usage or fetch error.`;

interface Args {
  target?: string;
  lintOnly: boolean;
  json: boolean;
  sample?: number;
  concurrency?: number;
  timeoutMs?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { lintOnly: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (arg === "--lint") args.lintOnly = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--sample") args.sample = Number(argv[++i]);
    else if (arg === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (arg === "--timeout") args.timeoutMs = Number(argv[++i]);
    else if (!arg.startsWith("-") && !args.target) args.target = arg;
    else {
      console.error(`Unknown argument: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return args;
}

function printReport(report: SiteReport, json: boolean): number {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`llms.txt: ${report.source}`);
    if (report.sourceProblems.length > 0) {
      for (const p of report.sourceProblems) console.log(`  ✗ ${p}`);
      return 1;
    }
    console.log(
      `  ${report.totalLinks} links listed, ${report.checked.length} checked`
    );
    for (const issue of report.lint) {
      const mark = issue.severity === "error" ? "✗" : "⚠";
      const at = issue.line ? ` (line ${issue.line})` : "";
      console.log(`  ${mark} lint/${issue.rule}${at}: ${issue.message}`);
    }
    for (const fail of report.failures) {
      console.log(`  ✗ ${fail.url} -> ${fail.problems.join("; ")}`);
    }
    if (report.failures.length === 0) {
      console.log("  ✓ all checked URLs serve content");
    }
  }
  const hasLintErrors = report.lint.some((i) => i.severity === "error");
  return report.failures.length > 0 ||
    report.sourceProblems.length > 0 ||
    hasLintErrors
    ? 1
    : 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error(HELP);
    return 2;
  }

  const isUrl = /^https?:\/\//.test(args.target);

  if (args.lintOnly) {
    const text = isUrl
      ? await (await fetch(args.target)).text()
      : await readFile(args.target, "utf-8");
    const doc = parse(text);
    const issues = lint(doc);
    if (args.json) {
      console.log(JSON.stringify({ lint: issues }, null, 2));
    } else {
      for (const issue of issues) {
        const at = issue.line ? ` (line ${issue.line})` : "";
        console.log(`${issue.severity} ${issue.rule}${at}: ${issue.message}`);
      }
      if (issues.length === 0) console.log("✓ no lint issues");
    }
    return issues.some((i) => i.severity === "error") ? 1 : 0;
  }

  const options = {
    sample: args.sample,
    concurrency: args.concurrency,
    timeoutMs: args.timeoutMs,
  };
  const report = isUrl
    ? await checkSite(args.target, options)
    : await checkText(await readFile(args.target, "utf-8"), args.target, options);
  return printReport(report, args.json);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
);
