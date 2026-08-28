/**
 * Execution adapter protocol — mark execution and prepaid wallet read.
 * Tracking is not part of this protocol.
 */

import type { PortoProduct } from "../../data/loader.js";
import type { ExecutionParameters, MarkExecution, PortoMark } from "../../execution/index.js";
import type { HealthStatus } from "../../states.js";
import type { MarkRequest } from "../../types/index.js";

export type BillingModel = "prepaid";

export interface Balance {
    balanceCents: number;
    currency: string;
    provider: string;
    wire: string;
    accountRef: string | null;
    asOf: Date;
    billingModel: BillingModel;
}

export interface ExecutionAdapter {
    readonly providerId: string;
    readonly wireId: string;
    mark(
        request: MarkRequest,
        resolvedProduct?: PortoProduct,
        execution?: ExecutionParameters,
    ): Promise<PortoMark>;
    markMany?(prepared: MarkExecution[], execution?: ExecutionParameters): Promise<PortoMark[]>;
    balance(execution?: ExecutionParameters): Promise<Balance>;
    health(): Promise<HealthStatus>;
    normalizeDocument(payload: Uint8Array): Uint8Array;
}
