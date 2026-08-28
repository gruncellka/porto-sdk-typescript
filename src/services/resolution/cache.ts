/**
 * Resolution result cache — TTL + LRU for `PortoResolver.resolve` only.
 */

import type { CacheConfig } from "../../config.js";
import type { ServiceKind } from "../../kinds.js";
import { secondsToMs } from "../../time.js";
import type { Dimensions } from "../../types/index.js";
import type { DeliveryPreference } from "./delivery-resolver.js";

export interface ResolutionCacheKeyInput {
    countryCode: string;
    weight: number;
    productId?: string;
    envelopeId?: string;
    dimensions?: Dimensions;
    deliveryPreference?: DeliveryPreference;
    indemnityTier?: string;
    services?: ServiceKind[];
    serviceIds?: string[];
}

interface CacheEntry {
    data: unknown;
    timestamp: number;
}

function sortedCsv(values: readonly string[] | undefined): string {
    if (!values?.length) return "";
    return [...values]
        .filter((v) => v != null && String(v) !== "")
        .map(String)
        .sort()
        .join(",");
}

export class ResolutionCache {
    private cache = new Map<string, CacheEntry>();
    private config: CacheConfig;

    constructor(config: CacheConfig) {
        this.config = config;
    }

    /** Key = fields that change a resolution result (order-independent for lists). */
    generateKey(providerId: string, request: ResolutionCacheKeyInput): string {
        const productId = request.productId || "";
        const preference = request.deliveryPreference || "";
        const indemnity = request.indemnityTier || "";
        const envelope = request.envelopeId || "";
        const kinds = sortedCsv(request.services);
        const pins = sortedCsv(request.serviceIds);
        const dims = request.dimensions
            ? `${request.dimensions.length}x${request.dimensions.width}x${request.dimensions.height}`
            : "";
        return `resolve:${providerId}:${request.countryCode}:${request.weight}:${productId}:${envelope}:${dims}:${preference}:${indemnity}:${kinds}:${pins}`;
    }

    get<T>(key: string): T | null {
        if (!this.config.enabled) return null;

        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > secondsToMs(this.config.ttl)) {
            this.cache.delete(key);
            return null;
        }

        // Refresh LRU order (Map insertion order).
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.data as T;
    }

    set<T>(key: string, data: T): void {
        if (!this.config.enabled) return;

        if (this.cache.size >= this.config.maxSize) {
            this.evictOldest();
        }

        this.cache.delete(key);
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }

    private evictOldest(count = 10): void {
        const keys = this.cache.keys();
        for (let i = 0; i < count; i++) {
            const next = keys.next();
            if (next.done) break;
            this.cache.delete(next.value);
        }
    }

    size(): number {
        return this.cache.size;
    }

    maxSize(): number {
        return this.config.maxSize;
    }
}
