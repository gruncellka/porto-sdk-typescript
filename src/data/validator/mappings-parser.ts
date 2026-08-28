/**
 * Parser for mappings.json.
 * Supports provider-aware structure (global + providers), not flat Record<string, string>.
 */

import type { MappingPair, PortoDataMappings } from "./types";

const DEFAULT_PROVIDER = "deutschepost";

/**
 * Parse mappings.json and yield (schemaPath, dataPath) pairs for global + given provider.
 * Rejects non-string values.
 */
export function parseMappingsToPairs(
    raw: unknown,
    provider: string = DEFAULT_PROVIDER,
): MappingPair[] {
    const pairs: MappingPair[] = [];
    const mappings = (raw as { mappings?: PortoDataMappings })?.mappings;
    if (!mappings || typeof mappings !== "object") return pairs;

    // Global mappings
    const globalMappings = mappings.global;
    if (globalMappings && typeof globalMappings === "object") {
        for (const [schemaPath, dataPath] of Object.entries(globalMappings)) {
            if (typeof schemaPath === "string" && typeof dataPath === "string") {
                pairs.push([schemaPath, dataPath]);
            }
        }
    }

    // Policy mappings
    const policyMappings = mappings.policy;
    if (policyMappings && typeof policyMappings === "object") {
        for (const [schemaPath, dataPath] of Object.entries(policyMappings)) {
            if (typeof schemaPath === "string" && typeof dataPath === "string") {
                pairs.push([schemaPath, dataPath]);
            }
        }
    }

    // Formats bundle (envelopes, layouts, addresses)
    const formatsMappings = mappings.formats;
    if (formatsMappings && typeof formatsMappings === "object") {
        for (const [schemaPath, dataPath] of Object.entries(formatsMappings)) {
            if (typeof schemaPath === "string" && typeof dataPath === "string") {
                pairs.push([schemaPath, dataPath]);
            }
        }
    }

    // Provider registry
    const registryMappings = mappings.registry;
    if (registryMappings && typeof registryMappings === "object") {
        for (const [schemaPath, dataPath] of Object.entries(registryMappings)) {
            if (typeof schemaPath === "string" && typeof dataPath === "string") {
                pairs.push([schemaPath, dataPath]);
            }
        }
    }

    // Provider mappings
    const providers = mappings.providers;
    const providerMappings = providers?.[provider];
    if (providerMappings && typeof providerMappings === "object") {
        for (const [schemaPath, dataPath] of Object.entries(providerMappings)) {
            if (typeof schemaPath === "string" && typeof dataPath === "string") {
                pairs.push([schemaPath, dataPath]);
            }
        }
    }

    return pairs;
}
