/**
 * Porto-data validator - orchestrates path, checksum, schema, and cross-file validation.
 * Uses small focused modules; single supported metadata shape (global + providers).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ConfigurationError, DataError, PortoErrorCode } from "../errors";
import type { PortoDataRegistries } from "./registries";
import { verifyChecksum } from "./validator/checksum-validator";
import { validateCrossFileConsistency } from "./validator/cross-file-consistency";
import { parseMappingsToPairs } from "./validator/mappings-parser";
import { normalizeMetadata } from "./validator/metadata-parser";
import { ensurePathIsFile } from "./validator/path-validator";
import { createAjv, validateSchema } from "./validator/schema-validator";
import type { MappingPair, PortoDataMetadata } from "./validator/types";

export type { MappingPair, PortoDataMetadata } from "./validator/types";

/**
 * Validator options. Metadata must have global + providers (no guessing mode).
 */
export interface PortoDataValidatorOptions {
    dataPath: string;
    metadata: unknown;
    mappings: unknown;
    verifyChecksums: boolean;
    provider?: string;
}

export class PortoDataValidator {
    private readonly ajv: ReturnType<typeof createAjv>;
    private readonly metadata: PortoDataMetadata;
    private readonly mappingPairs: MappingPair[];

    constructor(private readonly options: PortoDataValidatorOptions) {
        this.ajv = createAjv(options.dataPath);
        try {
            this.metadata = normalizeMetadata(options.metadata);
        } catch (err) {
            throw new ConfigurationError(
                err instanceof Error ? err.message : "Invalid metadata shape.",
                PortoErrorCode.PORTO_DATA_INVALID,
                500,
            );
        }
        this.mappingPairs = parseMappingsToPairs(
            options.mappings,
            options.provider ?? "deutschepost",
        );
    }

    validatePaths(): void {
        for (const [schemaPath, dataPath] of this.mappingPairs) {
            ensurePathIsFile(this.options.dataPath, schemaPath);
            ensurePathIsFile(this.options.dataPath, dataPath);
        }
    }

    validateMappedFile(dataRelativePath: string, schemaRelativePath: string): unknown {
        const data = this.loadJson(dataRelativePath);
        const schema = this.loadJson(schemaRelativePath);
        if (this.options.verifyChecksums) {
            verifyChecksum(this.options.dataPath, this.metadata, dataRelativePath);
            verifyChecksum(this.options.dataPath, this.metadata, schemaRelativePath);
        }
        validateSchema(
            this.ajv,
            this.options.dataPath,
            data,
            schema,
            dataRelativePath,
            schemaRelativePath,
        );
        return data;
    }

    validateCrossFileConsistency(registries: PortoDataRegistries): void {
        validateCrossFileConsistency(registries);
    }

    getMappingPairs(): MappingPair[] {
        return [...this.mappingPairs];
    }

    private loadJson(relativePath: string): unknown {
        const absolutePath = join(this.options.dataPath, relativePath);
        try {
            return JSON.parse(readFileSync(absolutePath, "utf-8"));
        } catch (error) {
            throw new DataError(
                `Failed to parse JSON file '${relativePath}': ${error}`,
                PortoErrorCode.PORTO_DATA_INVALID,
                500,
            );
        }
    }
}
