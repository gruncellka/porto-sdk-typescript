/**
 * Metadata parser - single supported shape: global + providers.
 */

import type { MetadataEntity, PortoDataMetadata } from "./types";

/**
 * Iterate over all entity entries from metadata (recursive walk).
 */
export function* iterMetadataEntities(
    metadata: PortoDataMetadata | Record<string, unknown>,
): Generator<MetadataEntity> {
    function* walk(node: unknown): Generator<MetadataEntity> {
        if (!node || typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        if ("data" in record || "schema" in record) {
            yield record as MetadataEntity;
            return;
        }
        for (const value of Object.values(record)) {
            yield* walk(value);
        }
    }

    if (hasSupportedMetadataShape(metadata)) {
        yield* walk(metadata.global);
        yield* walk(metadata.providers);
        return;
    }

    const root = metadata as Record<string, unknown>;
    for (const section of ["policy", "formats", "registry", "global", "providers"] as const) {
        const block = root[section];
        if (block) yield* walk(block);
    }
}

/**
 * Check if metadata has the supported shape (global + providers).
 */
export function hasSupportedMetadataShape(metadata: unknown): metadata is PortoDataMetadata {
    const m = metadata as PortoDataMetadata;
    return (
        m != null &&
        typeof m === "object" &&
        m.global != null &&
        typeof m.global === "object" &&
        m.providers != null &&
        typeof m.providers === "object"
    );
}

/**
 * Normalize metadata to supported shape (global + providers).
 */
export function normalizeMetadata(raw: unknown): PortoDataMetadata {
    if (hasSupportedMetadataShape(raw)) return raw;
    const record = raw as Record<string, unknown>;
    if (record && typeof record === "object" && typeof record.providers === "object") {
        const globalEntities: Record<string, MetadataEntity> = {};
        for (const section of ["policy", "formats", "registry"] as const) {
            const block = record[section];
            if (block && typeof block === "object") {
                globalEntities[section] = block as MetadataEntity;
            }
        }
        if (Object.keys(globalEntities).length > 0) {
            return {
                global: globalEntities,
                providers: record.providers as PortoDataMetadata["providers"],
            };
        }
    }
    throw new Error(
        "Metadata must have global+providers (or policy/formats/registry + providers). " +
            "Partial metadata is not supported.",
    );
}
