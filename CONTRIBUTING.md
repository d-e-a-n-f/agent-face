# Contributing to AgentFace

Thanks for your interest! AgentFace is early (0.x) — APIs may shift, and
that makes contributions especially valuable and especially worth
discussing first.

## Before you start

- **Bugs**: open an issue with a minimal reproduction. The DevTools trace
  (bottom panel → Trace) is gold in bug reports.
- **Features**: open an issue or discussion before writing code. The
  [roadmap](https://d-e-a-n-f.github.io/agent-face/docs/roadmap) shows
  where the project is headed; features that fight the architecture
  (e.g. anything letting a model bypass policy/confirmation) won't land.

## Development setup

```bash
pnpm install
pnpm build
pnpm test            # unit tests — deterministic, no model calls ever
pnpm check-types     # strict TS incl. noUncheckedIndexedAccess
pnpm lint
pnpm --filter web test:e2e   # Playwright (deterministic mock adapter)
pnpm dev             # playground on :3000
```

Node >= 20, pnpm 9.

## Ground rules for changes

- **Never weaken the safety model.** Confirmation is never a model tool;
  discovery stays policy-filtered; results stay JSON-safe; the action
  lifecycle order is contractual.
- **Type safety is a feature**: no `any`; avoid `unknown` where a generic
  or precise union can carry the real type; `JsonValue` for serialisable
  positions.
- **Every behavioural change needs a deterministic test.** CI runs no
  models; e2e drives the assistant through the mock adapter.
- **Errors are typed** (`AgentFaceError` with stable codes) — never string
  throws across package boundaries. Trace events, not `console.log`.
- Library packages use named exports and explicit `exports` maps; public
  APIs carry TSDoc with an example.

## Pull requests

1. Fork, branch from `main`.
2. Make the change with tests; run the full suite above.
3. Add a changeset when packages change behaviour:
   `pnpm changeset` (pick the affected packages; 0.x → minor for
   features, patch for fixes).
4. Open the PR — CI must pass (types, lint, tests, build, e2e, pack).

## Releases (maintainers)

Releases are **manual and local** — CI never publishes. With changesets
accumulated on `main`:

```bash
pnpm version-packages   # applies changesets: bumps versions, writes changelogs
git commit -am "Version packages" && git push
pnpm release            # build + test, then publish to npm and push tags
```

`pnpm release` requires being logged in to npm (`npm login`) with publish
rights on the @agentface org. `changeset publish` is idempotent — it only
publishes versions missing from the registry.

Small, focused PRs review fastest. If a change grows past ~500 lines,
consider splitting it or opening a discussion first.

## Security issues

Please do **not** open public issues for vulnerabilities — see
[SECURITY.md](SECURITY.md).
