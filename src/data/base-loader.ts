/**
 * Base Loader - Common file loading, checksum verification, and dependency resolution
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeResolutionGraph } from "./graph-normalize";
import type { ResolutionGraph } from "./loader";

export class BaseLoader {
    readonly dataPath: string;
    verifyChecksums: boolean;
    private metadata: Record<string, unknown> | null = null;
    checksumMap: Map<string, string> = new Map();

    constructor(dataPath: string, verifyChecksums = true) {
        this.dataPath = dataPath;
        this.verifyChecksums = verifyChecksums;
    }

    loadMetadata(): Record<string, unknown> | null {
        try {
            const data = this.loadData("metadata.json");
            this.metadata = data;
            if (this.metadata) {
                this.buildChecksumMap();
            }
            return this.metadata;
        } catch {
            return null;
        }
    }

    setMetadata(metadata: Record<string, unknown> | null): void {
        this.metadata = metadata;
        if (metadata) {
            this.buildChecksumMap();
        }
    }

    buildChecksumMap(): void {
        if (!this.metadata) return;
        this.checksumMap.clear();
        for (const entityData of this.iterMetadataEntities()) {
            for (const key of ["data", "schema"] as const) {
                const info = entityData[key];
                if (info?.path && info?.checksum) {
                    const normalizedPath = String(info.path).replace(/\\/g, "/");
                    this.checksumMap.set(normalizedPath, String(info.checksum));
                }
            }
        }
    }

    private iterMetadataEntities(): Array<{
        data?: { path?: string; checksum?: string };
        schema?: { path?: string; checksum?: string };
    }> {
        if (!this.metadata) return [];

        const result: Array<{
            data?: { path?: string; checksum?: string };
            schema?: { path?: string; checksum?: string };
        }> = [];

        const walk = (node: unknown): void => {
            if (!node || typeof node !== "object") return;
            const record = node as Record<string, unknown>;
            if ("data" in record || "schema" in record) {
                result.push(record as (typeof result)[number]);
                return;
            }
            for (const value of Object.values(record)) {
                walk(value);
            }
        };

        if (this.metadata.entities && typeof this.metadata.entities === "object") {
            for (const entity of Object.values(this.metadata.entities as Record<string, unknown>)) {
                walk(entity);
            }
            return result;
        }

        for (const section of ["policy", "formats", "registry", "global", "providers"] as const) {
            const block = this.metadata[section];
            if (block) walk(block);
        }
        return result;
    }

    getMetadataEntityKeys(): Set<string> {
        if (!this.metadata) return new Set();
        if (this.metadata.entities && typeof this.metadata.entities === "object") {
            return new Set(Object.keys(this.metadata.entities as Record<string, unknown>));
        }
        const keys = new Set<string>();
        for (const section of ["policy", "formats", "registry", "global"] as const) {
            const block = this.metadata[section];
            if (block && typeof block === "object") {
                Object.keys(block as Record<string, unknown>).forEach((k) => keys.add(k));
            }
        }
        const providers = this.metadata.providers;
        if (providers && typeof providers === "object") {
            for (const providerEntities of Object.values(providers as Record<string, unknown>)) {
                if (providerEntities && typeof providerEntities === "object") {
                    Object.keys(providerEntities as Record<string, unknown>).forEach((k) =>
                        keys.add(k),
                    );
                }
            }
        }
        return keys;
    }

    resolveRelativePath(filename: string): string {
        return filename;
    }

    loadData(filename: string): Record<string, unknown> {
        const relativePath = this.resolveRelativePath(filename);
        const filePath = join(this.dataPath, relativePath);
        try {
            if (this.verifyChecksums) {
                this.verifyFileChecksum(filePath, relativePath);
            }
            const content = readFileSync(filePath, "utf-8");
            return JSON.parse(content) as Record<string, unknown>;
        } catch (error) {
            throw new Error(`Failed to load porto-data file: ${filename}. Error: ${error}`);
        }
    }

    loadResolutionGraph(provider = "deutschepost"): ResolutionGraph {
        const candidates = [`providers/${provider}/graph.json`, "graph.json"];
        let data: Record<string, unknown> | null = null;
        for (const relativePath of candidates) {
            try {
                data = this.loadData(relativePath);
                break;
            } catch {}
        }
        if (!data) {
            throw new Error("Missing graph.json in porto-data");
        }
        const fileType = data.file_type;
        if (this.metadata) {
            const validTypes = this.getMetadataEntityKeys();
            if (fileType && !validTypes.has(String(fileType))) {
                throw new Error(
                    `File_type '${fileType}' not found in metadata.json. Expected one of: ${[...validTypes].sort().join(", ")}`,
                );
            }
        }
        return normalizeResolutionGraph(data);
    }

    verifyFileChecksum(filePath: string, relativePath: string): void {
        if (this.checksumMap.size === 0) return;
        const normalizedPath = relativePath.replace(/\\/g, "/");
        const expectedChecksum = this.checksumMap.get(normalizedPath);
        if (!expectedChecksum) return;
        const fileBuffer = readFileSync(filePath);
        const actualChecksum = createHash("sha256").update(fileBuffer).digest("hex");
        if (actualChecksum !== expectedChecksum) {
            throw new Error(
                `Checksum verification failed for ${relativePath}. Expected: ${expectedChecksum}, Actual: ${actualChecksum}.`,
            );
        }
    }

    calculateLoadOrder(resolutionGraph: ResolutionGraph): string[] {
        const graph = new Map<string, Set<string>>();
        const fileToKey = new Map<string, string>();
        const inDegree = new Map<string, number>();

        for (const [key, depInfo] of Object.entries(resolutionGraph.dependencies ?? {})) {
            const fileName = depInfo.file;
            fileToKey.set(fileName, key);
            inDegree.set(fileName, 0);
            if (!graph.has(fileName)) graph.set(fileName, new Set());
            for (const depFile of depInfo.depends_on ?? []) {
                graph.get(fileName)?.add(depFile);
            }
        }

        for (const fileName of fileToKey.keys()) {
            if (!inDegree.has(fileName)) inDegree.set(fileName, 0);
        }
        for (const [fileName, deps] of graph.entries()) {
            for (const dep of deps) {
                if (inDegree.has(dep)) {
                    inDegree.set(fileName, (inDegree.get(fileName) ?? 0) + 1);
                }
            }
        }

        const queue = [...inDegree.entries()]
            .filter(([, degree]) => degree === 0)
            .map(([fileName]) => fileName);
        const loadOrder: string[] = [];
        const processed = new Set<string>();

        while (queue.length > 0) {
            const fileName = queue.shift()!;
            if (processed.has(fileName)) continue;
            loadOrder.push(fileName);
            processed.add(fileName);
            for (const [otherFile, deps] of graph.entries()) {
                if (deps.has(fileName)) {
                    const newDegree = (inDegree.get(otherFile) ?? 0) - 1;
                    inDegree.set(otherFile, newDegree);
                    if (newDegree === 0) queue.push(otherFile);
                }
            }
        }

        const remaining = [...fileToKey.keys()].filter((f) => !processed.has(f));
        if (remaining.includes("zones.json") && remaining.includes("restrictions.json")) {
            if (!loadOrder.includes("zones.json")) {
                loadOrder.push("zones.json");
                processed.add("zones.json");
            }
            if (!loadOrder.includes("restrictions.json")) {
                loadOrder.push("restrictions.json");
                processed.add("restrictions.json");
            }
        }
        for (const fileName of remaining) {
            if (!processed.has(fileName)) {
                loadOrder.push(fileName);
                processed.add(fileName);
            }
        }
        return loadOrder;
    }
}
