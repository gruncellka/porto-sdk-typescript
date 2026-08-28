# Porto SDK TypeScript — Bugbot

Scope: this repo only (`@gruncellka/porto-sdk` / `porto-sdk-typescript`). Flag cross-SDK risks; do not prescribe consumer-app changes.

## Blocking

### 1) Behavior change without tests

PR changes `src/**` resolver, adapter, browser entry, or CLI behavior and does not update `tests/**`.

- Bug: `Behavior change without tests`
- Body: `Add or update unit, integration, or BDD coverage. Run make check.`
- Label: `quality`

### 2) BDD batch contract drift

PR changes `tests/bdd/steps/**`, `tests/bdd/runner/**`, or `scripts/test/run_bdd_batches.ts` without either matching Python `batches.py` ids or a PR note of intentional one-sided drift.

- Bug: `BDD batch contract drift risk`
- Body: `Keep batch ids aligned with porto-features and the Python SDK runner.`
- Labels: `integration`, `quality`

### 3) Non-registry dependency in committed manifest

`package.json` or `pnpm-lock.yaml` adds `file:`, `link:`, or `resources/` paths to committed dependency specs.

- Bug: `Non-registry dependency in committed manifest`
- Body: `Committed manifests use npm semver only. Run make registry.`
- Label: `release-blocker`

### 4) Execution manifest vs wire tables

Execution wiring reads product/checkout codes from `execution.json` instead of `graph.edges.wire`, or gates billing/execution without `execution.json` billing/execution lists.

- Bug: `SDK conflates execution manifest with wire tables`
- Body: `execution.json = wire + billing/execution methods; graph.edges.wire = checkout codes.`
- Labels: `architecture`, `integration`

### 5) Browser entry imports Node-only surface

`src/browser.ts` or embed build pulls filesystem loaders, env readers, or CLI modules into the browser bundle.

- Bug: `Browser entry imports Node-only surface`
- Label: `architecture`

## Non-blocking

### 6) Mark geometry hardcoded

Mark fetch hardcodes mm/px instead of `marks.calibrations[]` from embedded porto-data.

- Bug: `Mark geometry hardcoded instead of catalog calibrations`
- Label: `maintainability`

### 7) Untracked TODO/FIXME

TODO/FIXME without issue reference (`#123`).

- Bug: `Untracked TODO/FIXME comment`
- Label: `maintainability`
