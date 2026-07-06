# Contributing to Voice Agent Helper

Thanks for your interest in contributing! This is a reference/demo
repository (see [SUPPORT.md](SUPPORT.md) for maintenance expectations), but
fixes, cleanups, and small enhancements are welcome.

## How to Contribute

1. Fork the repository.
2. Create a branch from `main`: `git checkout -b my-fix`.
3. Make your change.
4. Run the checks described below.
5. Open a pull request against `main` describing what changed and why.

## Development Setup

```bash
npm install
npm run dev          # Vite + Wrangler local dev server
npm run test:watch   # Vitest in watch mode
```

No environment variables or secrets are required — the only external
dependency is the Workers AI (`AI`) binding, which is available on any
Cloudflare account and configured in `wrangler.jsonc`.

## Code Style

Linting and formatting are enforced via ESLint (flat config) and Prettier:

```bash
npm run lint        # eslint + prettier --check
npm run lint:fix     # eslint --fix + prettier --write
```

TypeScript strictness is enforced via `tsc -b` (part of `npm run build`).

## Commit Messages

Use short, imperative commit messages (e.g. `Fix STT latency calculation`,
not `Fixed bug`). Reference an issue number when relevant.

## Pull Request Process

Before opening a PR, run the full check suite locally:

```bash
npm run check   # lint + test + a dry-run build
```

CI (if configured on your fork) should be green before requesting review.
Reviewers will look for:

- Tests for new behavior (see `src/shared/messages.test.ts`,
  `src/client/components/DetailPanel.test.tsx`, and `src/client/App.test.tsx`
  for existing patterns)
- No drift between `src/shared/config.ts` and what the code actually does —
  it's the single source of truth for pipeline/quota configuration
- Consistent JSDoc on new exported functions/components

## Bug Reports

Please use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
and include steps to reproduce, expected vs. actual behavior, and your
browser/OS if relevant.

## Feature Requests

Please use the
[Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and
describe the problem you're trying to solve, not just the solution.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.
