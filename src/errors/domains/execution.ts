import { PortoErrorCode } from "../codes.js";
import { ProviderError } from "../exceptions.js";
import type { ProviderId, WireId } from "../models.js";

export function raiseWalletInsufficient(
    message: string,
    options: {
        requiredCents: number;
        walletAccountId?: string;
        provider?: ProviderId;
        wire?: WireId;
        upstreamCode?: string;
        statusCode?: number;
        details?: Record<string, unknown>;
    },
): never {
    const payload: Record<string, unknown> = {
        ...(options.details ?? {}),
        required_cents: options.requiredCents,
    };
    if (options.walletAccountId) payload.wallet_account_id = options.walletAccountId;
    throw new ProviderError(
        message,
        PortoErrorCode.PORTO_WALLET_INSUFFICIENT,
        options.statusCode,
        payload,
        false,
        options.provider,
        options.wire,
        options.upstreamCode,
    );
}
