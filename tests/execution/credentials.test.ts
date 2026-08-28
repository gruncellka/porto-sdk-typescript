import { describe, expect, it } from "vitest";

import type { Balance, ExecutionAdapter } from "../../src/adapters/protocols/execution.js";
import { PortoClient } from "../../src/client.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { buildPortoMark } from "../../src/execution/index.js";
import type { ExecutionParameters, PortoMark } from "../../src/execution/index.js";
import type { PortoExecution } from "../../src/services/porto-execution.js";
import { CapabilityState } from "../../src/states.js";
import type { MarkRequest } from "../../src/types/index.js";
import { boundProvider } from "../support/bound-provider.js";
import { resolvePortoDataPathForTests } from "../support/porto-data-path.js";

class CaptureAdapter implements ExecutionAdapter {
    readonly providerId = "deutschepost";
    readonly wireId = "internetmarke";
    calls: Array<Record<string, string> | undefined> = [];

    async mark(
        request: MarkRequest,
        _resolvedProduct?: unknown,
        execution?: ExecutionParameters,
    ): Promise<PortoMark> {
        this.calls.push(execution?.credentials ? { ...execution.credentials } : undefined);
        return buildPortoMark("deutschepost", "internetmarke", {
            content: "https://example.test/mark.png",
            contentType: "image/png",
            amount: request.value ?? 0,
        });
    }

    async balance(): Promise<Balance> {
        return {
            balanceCents: 0,
            currency: "EUR",
            provider: this.providerId,
            wire: this.wireId,
            accountRef: null,
            asOf: new Date(),
            billingModel: "prepaid",
        };
    }

    async health() {
        return { state: CapabilityState.Unavailable, detail: "capture adapter" };
    }

    normalizeDocument(payload: Uint8Array): Uint8Array {
        return payload;
    }
}

function client(): PortoClient {
    return new PortoClient({
        providers: { deutschepost: {} },
        data: resolvePortoDataPathForTests(),
        strictDataValidation: false,
    });
}

function install(c: PortoClient): {
    provider: ReturnType<typeof boundProvider>;
    adapter: CaptureAdapter;
} {
    const provider = boundProvider(c);
    const adapter = new CaptureAdapter();
    const execution = (provider as unknown as { execution: PortoExecution }).execution;
    execution.api = adapter;
    return { provider, adapter };
}

describe("per-call credentials and wire pin", () => {
    it("uses A then B on the same cached ProviderClient", async () => {
        const { provider, adapter } = install(client());
        const porto = await provider.resolve({ countryCode: "DE", weight: 20 });
        const credsA = { username: "user-a", password: "secret-a" };
        const credsB = { username: "user-b", password: "secret-b" };
        await provider.mark({ porto }, { credentials: credsA });
        await provider.mark({ porto }, { credentials: credsB });
        expect(adapter.calls).toEqual([credsA, credsB]);
        expect(provider.providerId).toBe("deutschepost");
    });

    it("keeps overlapping mark calls independent", async () => {
        const { provider, adapter } = install(client());
        const porto = await provider.resolve({ countryCode: "DE", weight: 20 });
        const credsA = { username: "user-a", password: "secret-a" };
        const credsB = { username: "user-b", password: "secret-b" };
        await Promise.all([
            provider.mark({ porto }, { credentials: credsA }),
            provider.mark({ porto }, { credentials: credsB }),
        ]);
        const seen = new Set(adapter.calls.map((row) => JSON.stringify(row)));
        expect(seen).toEqual(new Set([JSON.stringify(credsA), JSON.stringify(credsB)]));
    });

    it("omits ExecutionParameters.wire and still stamps internetmarke", async () => {
        const { provider } = install(client());
        const porto = await provider.resolve({ countryCode: "DE", weight: 20 });
        const mark = await provider.mark({ porto });
        expect(mark.wire).toBe("internetmarke");
        expect(mark.provider).toBe("deutschepost");
    });

    it("accepts an explicit internetmarke pin", async () => {
        const { provider } = install(client());
        const porto = await provider.resolve({ countryCode: "DE", weight: 20 });
        const mark = await provider.mark({ porto }, { wire: "internetmarke" });
        expect(mark.wire).toBe("internetmarke");
    });

    it("rejects an unknown wire pin", async () => {
        const { provider } = install(client());
        const porto = await provider.resolve({ countryCode: "DE", weight: 20 });
        await expect(provider.mark({ porto }, { wire: "no-such-wire" })).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_CAPABILITY_UNSUPPORTED,
        });
        await expect(provider.mark({ porto }, { wire: "no-such-wire" })).rejects.toBeInstanceOf(
            PortoError,
        );
    });
});
