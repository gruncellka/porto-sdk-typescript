/**
 * Schema validation with caching compiled schemas by path.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import Ajv from "ajv";

import { DataError, PortoErrorCode } from "../../errors";

type CachedValidate = ReturnType<Ajv["compile"]>;
const schemaCache = new Map<string, CachedValidate>();

function getCacheKey(schemaPath: string, dataPath: string): string {
    return `${schemaPath}::${dataPath}`;
}

function schemaIdFromFile(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return `https://raw.githubusercontent.com/gruncellka/porto-data/refs/heads/main/porto_data/schemas/${fileName}`;
}

/**
 * Register all local JSON schemas so cross-file $ref URLs resolve offline.
 */
export function registerLocalSchemas(ajv: Ajv, dataRoot: string): void {
    const schemasDir = join(dataRoot, "schemas");
    let entries: string[] = [];
    try {
        entries = readdirSync(schemasDir).filter((name) => name.endsWith(".json"));
    } catch {
        return;
    }

    for (const fileName of entries) {
        const relativePath = `schemas/${fileName}`;
        const absolutePath = join(dataRoot, relativePath);
        try {
            const schema = JSON.parse(readFileSync(absolutePath, "utf-8")) as Record<
                string,
                unknown
            >;
            const id = typeof schema.$id === "string" ? schema.$id : schemaIdFromFile(relativePath);
            if (!ajv.getSchema(id)) {
                ajv.addSchema({ ...schema, $id: id });
            }
        } catch {}
    }
}

/**
 * Create AJV instance with common formats.
 */
export function createAjv(dataRoot?: string): Ajv {
    const ajv = new Ajv({ strict: false, allErrors: true });
    ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
    ajv.addFormat("uri", /^(https?:\/\/|ftp:\/\/|urn:|mailto:).+/);
    if (dataRoot) {
        registerLocalSchemas(ajv, dataRoot);
    }
    return ajv;
}

/**
 * Validate data against schema. Caches compiled schema by path.
 */
export function validateSchema(
    ajv: Ajv,
    dataPath: string,
    data: unknown,
    schema: unknown,
    dataRelativePath: string,
    schemaRelativePath: string,
): void {
    const cacheKey = getCacheKey(schemaRelativePath, dataRelativePath);
    let validate = schemaCache.get(cacheKey);
    if (!validate) {
        const schemaId =
            typeof (schema as { $id?: string }).$id === "string"
                ? (schema as { $id: string }).$id
                : schemaIdFromFile(schemaRelativePath);
        validate = ajv.getSchema(schemaId) ?? ajv.compile(schema as object);
        schemaCache.set(cacheKey, validate);
    }
    const ok = validate(data);
    if (!ok) {
        const errs = validate.errors ?? [];
        const details = errs
            .map((err) => `${err.instancePath || "/"} ${err.message || ""}`.trim())
            .join("; ");
        throw new DataError(
            `Schema validation failed for '${dataRelativePath}' using '${schemaRelativePath}': ${details}`,
            PortoErrorCode.PORTO_DATA_INVALID,
            500,
        );
    }
}
