# @agentface/cli

## 0.1.0

### Minor Changes

- 852f2c7: New package: the `agentface` CLI.
  - `agentface init` — sets up an existing Next.js App Router app: installs
    the packages, writes the model endpoint (with an authorize placeholder
    that refuses to deploy unauthenticated), `agentface.config.ts` manifest,
    a one-component setup wrapper, and a first example surface. Never
    overwrites existing files.
  - `agentface doctor` — CI-friendly static health checks: unauthenticated
    model endpoint (fail), missing/development policy, duplicate face ids,
    sensitive actions without confirmation/preview, manifest routes without
    page files (fail).
  - `agentface generate-manifest` — validates `agentface.config.*` (loaded
    directly, TypeScript included) and writes `.agentface/manifest.json`.

### Patch Changes

- Updated dependencies [fb74184]
- Updated dependencies [27a30f1]
- Updated dependencies [f426699]
  - @agentface/core@0.1.0
