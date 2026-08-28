/**
 * Checksum validation with explicit checks for undefined, null, empty string.
 * Distinguishes "no entry" vs "entry incomplete".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ConfigurationError, DataError, PortoErrorCode } from "../../errors";
import { iterMetadataEntities } from "./metadata-parser";
import type { MetadataEntity } from "./types";
import type { PortoDataMetadata } from "./types";

function isChecksumValid(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

/**
 * Find expected checksum for a path. Returns undefined if not found.
 */
export function findExpectedChecksum(
    metadata: PortoDataMetadata,
    relativePath: string,
): string | undefined {
    for (const entity of iterMetadataEntities(metadata)) {
        const dataChecksum = entity.data?.path === relativePath ? entity.data.checksum : undefined;
        const schemaChecksum =
            entity.schema?.path === relativePath ? entity.schema.checksum : undefined;
        const checksum = dataChecksum ?? schemaChecksum;
        if (checksum !== undefined) return isChecksumValid(checksum) ? checksum : undefined;
    }
    return undefined;
}

/**
 * Validate checksum for a file. Throws with specific error for each invalid state.
 */
export function verifyChecksum(
    dataPath: string,
    metadata: PortoDataMetadata,
    relativePath: string,
): void {
    let found = false;
    let checksumValue: unknown = undefined;
    for (const entity of iterMetadataEntities(metadata)) {
        if (entity.data?.path === relativePath) {
            found = true;
            checksumValue = entity.data.checksum;
            break;
        }
        if (entity.schema?.path === relativePath) {
            found = true;
            checksumValue = entity.schema.checksum;
            break;
        }
    }

    if (!found) {
        // Mappings may reference files that metadata does not index — nothing to verify.
        return;
    }
    if (checksumValue === undefined) {
        throw new ConfigurationError(
            `Checksum entry for '${relativePath}' has undefined checksum.`,
            PortoErrorCode.PORTO_DATA_INVALID,
            500,
        );
    }
    if (checksumValue === null) {
        throw new ConfigurationError(
            `Checksum entry for '${relativePath}' has null checksum.`,
            PortoErrorCode.PORTO_DATA_INVALID,
            500,
        );
    }
    if (typeof checksumValue !== "string" || checksumValue === "") {
        throw new ConfigurationError(
            `Checksum entry for '${relativePath}' is incomplete (empty or invalid).`,
            PortoErrorCode.PORTO_DATA_INVALID,
            500,
        );
    }

    const absolutePath = join(dataPath, relativePath);
    const content = readFileSync(absolutePath);
    const hash = createHash("sha256");
    hash.update(content);
    const actual = hash.digest("hex");
    if (actual !== checksumValue) {
        throw new DataError(
            `Checksum mismatch for '${relativePath}'. Data file does not match metadata. Run 'make metadata' in porto-data to regenerate checksums.`,
            PortoErrorCode.PORTO_DATA_CORRUPTED,
            422, // Unprocessable Entity - data integrity/validation failure, not server error
            { expected: checksumValue, actual },
        );
    }
}
