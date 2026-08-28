.PHONY: . help sync install-hooks registry bindings sync-bindings lint types build check validate clean clean-deps clean-all test sdk adapters heavy test-cov test-api artifact artifacts-clean artifacts-list artifacts-summary

.DEFAULT_GOAL := .

PNPM := $(shell command -v pnpm 2>/dev/null || echo pnpm)
PYTHON := $(shell command -v python3 2>/dev/null || echo python3)

ARTIFACTS_DIR ?= artifacts
TIMESTAMP := $(shell date -u +%Y-%m-%dT%H-%M-%SZ)
RUN_ID := $(TIMESTAMP)_local

help:
	@echo "Porto SDK TypeScript — Make targets"
	@echo "  make sync install-hooks registry bindings sync-bindings lint types test check validate build artifact"
	@echo "  make sdk adapters heavy test-cov test-api"
	@echo "  make artifacts-clean artifacts-list artifacts-summary clean clean-deps clean-all"

.:
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "pnpm not found."; \
		echo "   corepack enable && corepack prepare pnpm@9 --activate"; \
		exit 1; \
	fi
	@if [ ! -d node_modules ]; then \
		pnpm install; \
	fi
	@$(MAKE) install-hooks
	@echo "TypeScript SDK ready (node_modules)"

install-hooks:
	@if ! command -v pre-commit >/dev/null 2>&1; then \
		echo "pre-commit CLI not found — installing with $(PYTHON) -m pip --user ..."; \
		$(PYTHON) -m pip install --user 'pre-commit>=3.5.0'; \
	fi
	@pre-commit install
	@echo "Pre-commit hooks installed (.pre-commit-config.yaml → make check leaf jobs)"

sync:
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "pnpm not found."; \
		echo "   corepack enable && corepack prepare pnpm@9 --activate"; \
		exit 1; \
	fi
	@pnpm install
	@$(MAKE) install-hooks
	@echo "TypeScript SDK ready (node_modules)"

registry:
	@$(PYTHON) scripts/check_registry.py --root "$(CURDIR)"

sync-bindings: .
	@node scripts/build/build_error_bindings.mjs

bindings: .
	@pnpm run check:bindings

lint: .
	@pnpm run lint

types: .
	@pnpm run build:check

build: .
	@pnpm run build

check:
	@$(MAKE) registry
	@$(MAKE) bindings
	@$(MAKE) lint
	@$(MAKE) types
	@$(MAKE) test

validate: check sdk adapters

artifact: build
	@node scripts/release/verify-artifact.mjs

sdk: .
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --group cli
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --group core
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --group provider

adapters: .
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --group adapters

heavy: .
	@pnpm exec tsx scripts/test/require-internetmarke-canary-env.ts
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --batch adapters-internetmarke-marks-canary
	@pnpm exec tsx scripts/test/run_bdd_batches.ts --batch adapters-internetmarke-marks-full

test: .
	@pnpm exec tsx scripts/test/run_integ_suite.ts integ

test-cov: .
	@pnpm exec vitest run --coverage

test-api: .
	@if [ "$$I_ACCEPT_PAID_API_COST" != "1" ]; then \
		echo "test-api: I_ACCEPT_PAID_API_COST=1 is required"; \
		exit 1; \
	fi
	@pnpm exec tsx scripts/test/run_integ_suite.ts api

artifacts-clean:
	@cd $(ARTIFACTS_DIR) && ls -t 2>/dev/null | tail -n +6 | xargs -r rm -rf || true

artifacts-list:
	@ls -lt $(ARTIFACTS_DIR) 2>/dev/null | head -10 || echo "No runs yet"

artifacts-summary:
	@cat artifacts/bdd/latest/summary.json 2>/dev/null | $(PYTHON) -m json.tool || echo "No summary available"

clean:
	@rm -rf dist artifact-smoke-npm 2>/dev/null || true
	@find . -type f -name "*.tsbuildinfo" -delete 2>/dev/null || true
	@find . -type d \( -name ".turbo" -o -name "coverage" \) -exec rm -rf {} + 2>/dev/null || true

clean-deps:
	@rm -rf node_modules 2>/dev/null || true

clean-all: clean clean-deps
