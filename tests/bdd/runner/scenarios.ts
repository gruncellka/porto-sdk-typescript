/** List Gherkin scenario names for a batch from the feature file. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BddBatch } from "./batches.js";

export function featureTreeForBatch(batch: BddBatch): "sdk" | "adapters" {
    return batch.group === "adapters" ? "adapters" : "sdk";
}

export function featurePathForBatch(featuresRoot: string, batch: BddBatch): string {
    if (!batch.featureGlob) {
        throw new Error(`batch ${batch.id} requires featureGlob`);
    }
    return join(featuresRoot, "features", featureTreeForBatch(batch), batch.featureGlob);
}

export function cucumberTagsForBatch(batch: BddBatch): string {
    if (batch.tags) return batch.tags;
    return batch.group === "adapters" ? "@adapters" : "@sdk and not @adapters";
}

export function listAllScenariosInFeature(batch: BddBatch, featuresRoot: string): string[] {
    const featurePath = featurePathForBatch(featuresRoot, batch);
    const names: string[] = [];

    for (const line of readFileSync(featurePath, "utf8").split("\n")) {
        const match = line.match(/^\s*Scenario(?: Outline)?: (.+)\s*$/);
        if (match) {
            names.push(match[1]);
        }
    }

    return names;
}

export function batchScopeCounts(
    batch: BddBatch,
    featuresRoot: string,
): { selected: string[]; inScope: number; deselected: number } {
    const selected = listScenariosForBatch(batch, featuresRoot);
    const inScope = listAllScenariosInFeature(batch, featuresRoot).length;
    return {
        selected,
        inScope,
        deselected: Math.max(inScope - selected.length, 0),
    };
}

export function listScenariosForBatch(batch: BddBatch, featuresRoot: string): string[] {
    const featurePath = featurePathForBatch(featuresRoot, batch);
    const pattern = batch.namePattern ? new RegExp(batch.namePattern) : null;
    const names: string[] = [];

    for (const line of readFileSync(featurePath, "utf8").split("\n")) {
        const match = line.match(/^\s*Scenario(?: Outline)?: (.+)\s*$/);
        if (!match) {
            continue;
        }
        const name = match[1];
        if (!pattern || pattern.test(name)) {
            names.push(name);
        }
    }

    return names;
}

export function escapeCucumberName(name: string): string {
    return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scenarioSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}
