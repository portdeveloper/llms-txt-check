# llms-txt-check

Validate a site's `llms.txt` against what the site actually serves.

Your llms.txt generator promises AI tools a map of your docs. This tool verifies the deployed site honors the map, and fails your CI when it stops.

```bash
npx llms-txt-check https://your-docs-site.com
```

## Why a generator isn't enough

Generators run at build time. Breakage happens at the serving layer: host redirect rules, trailing-slash normalization, docs restructures, domain migrations. Your build can be green while every AI agent reading your llms.txt gets 404s.

Real examples found with this tool in August 2026:

- Drizzle ORM's llms.txt listed 70 URLs (16% of the file, the entire PostgreSQL section) that returned 404 in production.
- Cursor's docs moved domains, and the old `docs.cursor.com/llms.txt` started redirecting to an HTML marketing page. Agents holding the previously correct URL now ingest a React shell.
- A Docusaurus site served a zero-byte llms.txt because of a `trailingSlash` config interaction.

None of these sites had a broken build. All of them had a broken llms.txt.

## What it checks

1. **Discovery.** `/llms.txt` exists, returns 200, and is markdown rather than an HTML app shell.
2. **Spec lint.** One H1 title, well-formed `- [title](url): description` entries, no duplicate or relative URLs, no staging domains baked in.
3. **Serving validation.** Every listed URL is fetched against the live site and checked for HTTP errors, zero-byte and near-empty bodies, and `.md` URLs that return HTML.

## Usage

```bash
# Check a deployed site (fetches <url>/llms.txt)
npx llms-txt-check https://docs.example.com

# Check a llms.txt URL directly
npx llms-txt-check https://docs.example.com/llms.txt

# Lint a local file without network checks
npx llms-txt-check ./static/llms.txt --lint

# Spot-check 50 URLs spread across a large file
npx llms-txt-check https://docs.example.com --sample 50

# Machine-readable output
npx llms-txt-check https://docs.example.com --json
```

Exit code 0 means healthy, 1 means problems were found, 2 means the tool itself could not run. That makes CI integration one line:

```yaml
# .github/workflows/deploy.yml, after your deploy step
- run: npx llms-txt-check ${{ env.DEPLOY_URL }}
```

## Library API

The parser and checks are exported for programmatic use, with zero dependencies:

```ts
import { parse, lint, checkSite } from "llms-txt-check";

const doc = parse(text);
// { title, summary, preamble, sections: [{ name, links: [{ title, url, description }] }] }

const issues = lint(doc, { origin: "https://docs.example.com" });

const report = await checkSite("https://docs.example.com", { sample: 50 });
console.log(report.failures);
```

## Options

| Flag | Default | What it does |
| --- | --- | --- |
| `--sample <n>` | all | Check at most n URLs, spread evenly across the file |
| `--concurrency <n>` | 8 | Parallel requests |
| `--timeout <ms>` | 15000 | Per-request timeout |
| `--lint` | off | Skip network checks, lint the file structure only |
| `--json` | off | Machine-readable report |

## License

MIT
