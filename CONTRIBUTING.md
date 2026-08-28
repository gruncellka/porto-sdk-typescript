# Contributing to Porto SDK

This repository is the TypeScript Porto SDK (`@gruncellka/porto-sdk`).

The same product ships as [Python](https://github.com/gruncellka/porto-sdk-python). Catalog facts live in [porto-data](https://github.com/gruncellka/porto-data). Behavioral contracts live in [porto-features](https://github.com/gruncellka/porto-features).

## Setup

Requires **Node ≥20** and **pnpm 9**. Python 3 is used by maintenance scripts and the `pre-commit` CLI (`make install-hooks` installs it via pip if missing).

```bash
make
```

Installs `node_modules` from the registry lockfile and git pre-commit hooks (`make install-hooks`).

Hooks run the same leaf jobs as `make check` on every commit (registry, bindings, lint, types, test). BDD (`sdk` / `adapters`) and `build` stay in CI / `make validate`.

## Commands

Before a pull request:

```bash
make validate
```

`make help` lists targets.

| Command | What it runs |
| --- | --- |
| `make` / `make sync` | pnpm install + git hooks |
| `make install-hooks` | install/reinstall git pre-commit hooks |
| `make registry` | committed manifests use registry semver only |
| `make bindings` | PortoErrorCode matches porto-features |
| `make sync-bindings` | regenerate PortoErrorCode |
| `make lint` / `make types` / `make test` | biome / tsc / unit tests |
| `make check` | registry + bindings + lint + types + test (also pre-commit) |
| `make sdk` / `make adapters` | SDK / adapters BDD |
| `make validate` | check + sdk + adapters |
| `make build` / `make artifact` | pack + ArtifactContract + clean-env smoke |
| `make heavy` | Internetmarke canary + matrix (`I_ACCEPT_PAID_API_COST=1` + secrets) |

## Catalog and contracts

Committed manifests use npm ranges only. Local overlays (if any) are applied from outside this repository — this SDK does not detect or wire sibling checkouts.

Error codes are authored in porto-features (`errors.json`). Do not hand-edit `src/errors/codes.ts`. After catalog changes: `make sync-bindings`, then commit. `make check` runs `make bindings`.

## Pull requests

- Keep the change focused. Add tests when behavior changes.
- Run `make validate`.
- Update [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Note **Python parity** when changing resolve, mark, adapters, or scenarios.

## Releases

Version in `package.json` must match git tag `vX.Y.Z`. Bump with `bump2version` (`.bumpversion.cfg`; install via `pip install -r requirements-dev.txt`; `tag = False` — create `vX.Y.Z` on main manually). PRs require the `validate` check. Tag publish runs validate → artifact → heavy → npm → GitHub Release.
