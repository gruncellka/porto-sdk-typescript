/**
 * Execution adapter placeholder when operator has no wired execution.
 */

import { PortoError, PortoErrorCode } from "../errors.js";
import type { ExecutionParameters, PortoMark } from "../execution/index.js";
import type { MarkRequest } from "../types/index.js";
import type { Balance, ExecutionAdapter } from "./protocols/execution.js";

export class UnavailableExecutionAdapter implements ExecutionAdapter {
    readonly providerId: string;
    readonly wireId: string;

    constructor(providerId: string, wireId?: string) {
        this.providerId = providerId.trim().toLowerCase();
        this.wireId = wireId ?? "none";
    }

    async mark(
        _request: MarkRequest,
        _resolvedProduct?: unknown,
        _execution?: ExecutionParameters,
    ): Promise<PortoMark> {
        throw this.unsupported("mark");
    }

    async balance(_execution?: ExecutionParameters): Promise<Balance> {
        throw this.unsupported("wallet");
    }

    async health() {
        const { CapabilityState } = await import("../states.js");
        return {
            state: CapabilityState.Unavailable,
            detail: `no execution wire for ${this.providerId}`,
        };
    }

    normalizeDocument(payload: Uint8Array): Uint8Array {
        return payload;
    }

    private unsupported(capability: string): PortoError {
        return new PortoError(
            `${capability} is not supported for provider ${JSON.stringify(this.providerId)}`,
            PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
            501,
            { capability, provider_id: this.providerId, wire: this.wireId },
            false,
            this.providerId,
            this.wireId,
        );
    }
}
