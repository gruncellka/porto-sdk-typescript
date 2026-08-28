/**
 * Single source of truth for @sdk BDD batch definitions (TypeScript SDK).
 * Keep ids, order, and globs aligned with sdks/porto-sdk-python/tests/bdd/runner/batches.py
 */

export type BddBatchGroup = "cli" | "core" | "provider" | "adapters";

export interface BddBatch {
    id: string;
    label: string;
    group: BddBatchGroup;
    /** Relative to features/sdk/ or features/adapters/ */
    featureGlob?: string;
    /** Cucumber --name regex; mirrors Python pytest -k keyword_filter */
    namePattern?: string;
    /** Cucumber --tags override (default: @sdk or @adapters by group). */
    tags?: string;
    /** Secret-gated; excluded from default `make sdk` / `make validate`. */
    publishGated?: boolean;
}

function validateBatch(batch: BddBatch): void {
    if (!batch.featureGlob && !batch.namePattern) {
        throw new Error(`batch ${batch.id} needs featureGlob and/or namePattern`);
    }
}

// CLI: one feature file, split by provider Rules (namePattern).
// Provider order: porto-data bundle order (DE → UA → FR → CH) — see providers.ts.
// Core / provider: one batch per feature file (featureGlob).
export const BDD_BATCHES: readonly BddBatch[] = [
    {
        id: "cli-core",
        label: "CLI · core",
        group: "cli",
        featureGlob: "core/cli.feature",
    },
    {
        id: "cli-deutschepost",
        label: "CLI · deutschepost",
        group: "cli",
        featureGlob: "providers/deutschepost/cli.feature",
    },
    {
        id: "cli-ukrposhta",
        label: "CLI · ukrposhta",
        group: "cli",
        featureGlob: "providers/ukrposhta/cli.feature",
    },
    {
        id: "cli-laposte",
        label: "CLI · laposte",
        group: "cli",
        featureGlob: "providers/laposte/cli.feature",
    },
    {
        id: "cli-swisspost",
        label: "CLI · swisspost",
        group: "cli",
        featureGlob: "providers/swisspost/cli.feature",
    },
    {
        id: "core-data",
        label: "Core · data access",
        group: "core",
        featureGlob: "core/data.feature",
    },
    {
        id: "core-metadata",
        label: "Core · metadata",
        group: "core",
        featureGlob: "core/metadata.feature",
    },
    {
        id: "core-resolution",
        label: "Core · public resolution",
        group: "core",
        featureGlob: "core/resolution.feature",
    },
    {
        id: "core-restrictions",
        label: "Core · restrictions",
        group: "core",
        featureGlob: "core/restrictions.feature",
    },
    {
        id: "core-validation",
        label: "Core · validation",
        group: "core",
        featureGlob: "core/validation.feature",
    },
    {
        id: "core-errors",
        label: "Core · normalized errors",
        group: "core",
        featureGlob: "core/errors.feature",
    },
    {
        id: "core-mark",
        label: "Core · mark",
        group: "core",
        featureGlob: "core/mark.feature",
    },
    {
        id: "deutschepost-resolution",
        label: "Deutsche Post · resolution",
        group: "provider",
        featureGlob: "providers/deutschepost/resolution.feature",
    },
    {
        id: "deutschepost-pricing",
        label: "Deutsche Post · pricing",
        group: "provider",
        featureGlob: "providers/deutschepost/pricing.feature",
    },
    {
        id: "deutschepost-services",
        label: "Deutsche Post · services",
        group: "provider",
        featureGlob: "providers/deutschepost/services.feature",
    },
    {
        id: "deutschepost-products",
        label: "Deutsche Post · products",
        group: "provider",
        featureGlob: "providers/deutschepost/products.feature",
    },
    {
        id: "ukrposhta-resolution",
        label: "Ukrposhta · resolution",
        group: "provider",
        featureGlob: "providers/ukrposhta/resolution.feature",
    },
    {
        id: "ukrposhta-products",
        label: "Ukrposhta · products",
        group: "provider",
        featureGlob: "providers/ukrposhta/products.feature",
    },
    {
        id: "laposte-resolution",
        label: "La Poste · resolution",
        group: "provider",
        featureGlob: "providers/laposte/resolution.feature",
    },
    {
        id: "laposte-products",
        label: "La Poste · products",
        group: "provider",
        featureGlob: "providers/laposte/products.feature",
    },
    {
        id: "swisspost-resolution",
        label: "Swiss Post · resolution",
        group: "provider",
        featureGlob: "providers/swisspost/resolution.feature",
    },
    {
        id: "adapters-internetmarke-errors",
        label: "Adapters · Internetmarke errors",
        group: "adapters",
        featureGlob: "deutschepost/internetmarke/errors.feature",
    },
    {
        id: "adapters-internetmarke-marks-canary",
        label: "Adapters · Internetmarke marks canary",
        group: "adapters",
        featureGlob: "deutschepost/internetmarke/marks.feature",
        namePattern: "Purchase mark with pricing",
        tags: "@adapters and @canary",
        publishGated: true,
    },
    {
        id: "adapters-internetmarke-marks-full",
        label: "Adapters · Internetmarke marks full",
        group: "adapters",
        featureGlob: "deutschepost/internetmarke/marks.feature",
        tags: "@adapters and (@canary or @heavy)",
        publishGated: true,
    },
];

export function batchesFor(
    options: {
        batchId?: string;
        group?: BddBatchGroup;
    } = {},
): BddBatch[] {
    let selected = [...BDD_BATCHES];
    if (options.group) {
        selected = selected.filter((batch) => batch.group === options.group);
    }
    if (options.batchId) {
        selected = selected.filter((batch) => batch.id === options.batchId);
        if (selected.length === 0) {
            const known = BDD_BATCHES.map((batch) => batch.id).join(", ");
            throw new Error(`Unknown batch ${options.batchId}. Known: ${known}`);
        }
    } else {
        selected = selected.filter((batch) => !batch.publishGated);
    }
    for (const batch of selected) {
        validateBatch(batch);
    }
    return selected;
}
