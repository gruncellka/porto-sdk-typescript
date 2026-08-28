/**
 * Select the public wire id for an execution operation.
 */

import { listApplicableWires } from "../adapters/execution-registry.js";
import { PortoError, PortoErrorCode } from "../errors.js";

export function selectWire(args: {
    providerId: string;
    operation: string;
    pin?: string | null;
    dataPath?: string | null;
}): string {
    const provider = args.providerId.trim().toLowerCase();
    const applicable = listApplicableWires(provider, args.operation, args.dataPath);
    const token = args.pin?.trim().toLowerCase() || undefined;
    if (token) {
        if (!applicable.includes(token)) {
            throw new PortoError(
                `${args.operation} is not supported for wire ${JSON.stringify(token)}`,
                PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
                501,
                { capability: args.operation, provider_id: provider, wire: token },
                false,
                provider,
                token,
            );
        }
        return token;
    }
    if (applicable.length === 1) {
        return applicable[0]!;
    }
    throw new PortoError(
        `${args.operation} is not supported for provider ${JSON.stringify(provider)}`,
        PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
        501,
        { capability: args.operation, provider_id: provider },
        false,
        provider,
    );
}
