# Review before publish

Things I (Claude) decided on your behalf while scaffolding. Delete this file once resolved.

## Decisions to confirm

1. **Package name: `llmstxt-check`.** Also free on npm: `llms-txt-check`. The chosen name matches the npx invocation but confirm you like it before publish, renames after publish are painful.
2. **Author email is your work address** (`port@monad.foundation`, taken from git config). For a personal OSS project you may want your personal email in package.json, especially given the watchman IP adjacency we discussed.
3. **`off-origin-url` is a warning, exit 0.** bun.sh serves an llms.txt whose links all point at bun.com (domain migration). Real situation, arguably intentional on their side, so it warns without failing. Flip to error if you disagree.
4. **`--sample` defaults to all links.** A 2000-link file (PostHog) takes ~4 min at concurrency 8. Fine for CI, maybe surprising for a curious first run. Could default to 100 with an `--all` flag instead.
5. **No baseline/drift mode yet.** The watchman-style "fail only on regressions" mode is deferred to v0.2 to keep v0.1 small. README doesn't promise it.
6. **GitHub repo URL in package.json** assumes `portdeveloper/llmstxt-check`. Create the repo with that name or fix the field.

## Known rough edges

- `empty-section` fires 9 times on Drizzle because their generator emits headers for collapsible groups. Real per spec, but noisy; consider downgrading to info or deduping.
- The link regex now allows nested brackets in titles (`[Joins [SQL]]`) but a description containing `](` would still confuse it.
- No retry on transient network errors; a flaky fetch fails CI. Probably want one retry before v0.2.

## Pre-publish checklist

- [ ] `npm test` green (was green at scaffold time, 14 tests)
- [ ] create GitHub repo, push, confirm CI matrix passes
- [ ] `npm publish --dry-run` and check the file list
- [ ] decide drizzle issue timing relative to publish (bug report draft: `/home/ubuntu/pr-drafts/drizzle-llms-txt.md`)
