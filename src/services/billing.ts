/**
 * Billing service — prepaid wallet read (capability-gated).
 */

import { getExecutionAdapter } from "../adapters/execution-registry.js";
import type { Balance, ExecutionAdapter } from "../adapters/protocols/execution.js";
import type { PortoClient } from "../client.js";
import { type WireConfig, normalizePortoConfig } from "../config.js";
import { PortoError, PortoErrorCode } from "../errors.js";
import type { ExecutionParameters } from "../execution/index.js";
import { selectWire } from "./wire-selection.js";

export class BillingService {
    constructor(
        private readonly client: PortoClient,
        private readonly scope?: {
            providerId?: string;
            wires?: Record<string, WireConfig>;
            adapter?: ExecutionAdapter;
        },
    ) {}

    private providerId(): string {
        return (
            this.scope?.providerId ??
            Object.keys(normalizePortoConfig(this.client.config).providers)[0]
        );
    }

    private dataPath(): string | undefined {
        return this.client.config.data;
    }

    private executionAdapter(): ExecutionAdapter {
        if (this.scope?.adapter) {
            return this.scope.adapter;
        }
        return getExecutionAdapter(
            this.providerId(),
            this.scope?.wires,
            undefined,
            this.dataPath(),
        );
    }

    async balance(execution?: ExecutionParameters): Promise<Balance> {
        const provider = this.providerId();
        const wire = selectWire({
            providerId: provider,
            operation: "wallet",
            pin: execution?.wire,
            dataPath: this.dataPath(),
        });
        const adapter = this.executionAdapter();
        if (adapter.wireId !== wire) {
            throw new PortoError(
                `wallet is not supported for wire ${JSON.stringify(wire)}`,
                PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
                501,
                { capability: "wallet", provider_id: provider, wire },
                false,
                provider,
                wire,
            );
        }
        return adapter.balance(execution);
    }
}
