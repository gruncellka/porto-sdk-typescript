/** Catalog compatibility gate — porto-data package version is the schema version. */

import { ConfigurationError, PortoErrorCode } from "../errors";

/** Mirrors SDK manifest range for @gruncellka/porto-data (>=min,<maxExclusive). */
export const SUPPORTED_PORTO_DATA_VERSION_MIN = "0.7.0";
export const SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE = "1.0.0";

function parseSemver(version: string): [number, number, number] | null {
    const parts = version.trim().split(".");
    if (parts.length < 2) return null;
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    const patch = parts.length > 2 ? Number(parts[2]) : 0;
    if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
        return null;
    }
    return [major, minor, patch];
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

export function assertCatalogSchemaSupported(metadata: unknown, path = "metadata.json"): string {
    const project =
        metadata && typeof metadata === "object" && "project" in metadata
            ? (metadata as { project?: unknown }).project
            : undefined;
    const raw =
        project && typeof project === "object" && "version" in project
            ? (project as { version?: unknown }).version
            : undefined;

    const parsed = typeof raw === "string" ? parseSemver(raw) : null;
    const minV = parseSemver(SUPPORTED_PORTO_DATA_VERSION_MIN)!;
    const maxV = parseSemver(SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE)!;

    const details = {
        porto_data_version: raw,
        supported_min: SUPPORTED_PORTO_DATA_VERSION_MIN,
        supported_max_exclusive: SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE,
        path,
    };

    if (parsed === null) {
        throw new ConfigurationError(
            `porto-data metadata.json is missing a valid project.version. Upgrade @gruncellka/porto-data to >=${SUPPORTED_PORTO_DATA_VERSION_MIN},<${SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE}.`,
            PortoErrorCode.PORTO_DATA_INVALID,
            undefined,
            details,
        );
    }

    if (cmp(parsed, minV) < 0) {
        throw new ConfigurationError(
            `porto-data package version ${raw} is older than this SDK supports (>=${SUPPORTED_PORTO_DATA_VERSION_MIN},<${SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE}). Upgrade porto-data.`,
            PortoErrorCode.PORTO_DATA_TOO_OLD,
            undefined,
            details,
        );
    }

    if (cmp(parsed, maxV) >= 0) {
        throw new ConfigurationError(
            `porto-data package version ${raw} is newer than this SDK supports (>=${SUPPORTED_PORTO_DATA_VERSION_MIN},<${SUPPORTED_PORTO_DATA_VERSION_MAX_EXCLUSIVE}). Upgrade the Porto SDK, or pin porto-data within the supported range.`,
            PortoErrorCode.PORTO_DATA_TOO_NEW,
            undefined,
            details,
        );
    }

    return raw as string;
}
