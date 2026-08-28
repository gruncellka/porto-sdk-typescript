/**
 * ExecutionBinding — how a postal decision can be executed (wire + mark profile).
 * Consumes product/zone facts. Must not re-select product or price.
 */

import type { PortoDataLoader } from "../data/loader.js";
import { resolveMarkProfileId } from "./mark-resolution.js";
import { type WireCode, resolveWireCode } from "./wire-resolution.js";

export interface ExecutionBindingResult {
    wireCode: WireCode;
    markProfileId: string | null;
}

export class ExecutionBinding {
    constructor(private readonly loader: PortoDataLoader) {}

    resolveWireCode(input: {
        wire: string;
        productId: string;
        zoneId: string;
        serviceIds?: string[] | null;
    }): WireCode {
        const graph = this.loader.resolutionGraph;
        return resolveWireCode({
            wireEdges: graph.wire_edges ?? {},
            strategy: graph.strategy,
            wire: input.wire,
            productId: input.productId,
            zoneId: input.zoneId,
            serviceIds: input.serviceIds,
        });
    }

    resolveMarkProfileId(input: {
        zoneId?: string | null;
        serviceIds?: string[] | null;
    }): string | null {
        const graph = this.loader.resolutionGraph;
        const defaultProfile = this.loader.getDefaultMarkProfile();
        return resolveMarkProfileId({
            markEdges: graph.mark_edges ?? {},
            zoneId: input.zoneId ?? null,
            serviceIds: input.serviceIds,
            defaultProfileId: defaultProfile?.id ?? null,
        });
    }

    bind(input: {
        wire: string;
        productId: string;
        zoneId: string;
        serviceIds?: string[] | null;
    }): ExecutionBindingResult {
        return {
            wireCode: this.resolveWireCode(input),
            markProfileId: this.resolveMarkProfileId({
                zoneId: input.zoneId,
                serviceIds: input.serviceIds,
            }),
        };
    }
}
