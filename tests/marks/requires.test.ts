import { describe, expect, it, vi } from "vitest";

import type { Balance, ExecutionAdapter } from "../../src/adapters/protocols/execution.js";
import { PortoClient } from "../../src/browser.js";
import { PortoErrorCode } from "../../src/errors.js";
import { buildPortoMark } from "../../src/execution/index.js";
import type { PortoMark, PortoMarkRequest } from "../../src/execution/index.js";
import { ADDRESS, RECIPIENT, SENDER } from "../../src/requires.js";
import type { PortoExecution } from "../../src/services/porto-execution.js";
import type { Porto, PortoResolver } from "../../src/services/porto-resolver.js";
import { CapabilityState } from "../../src/states.js";
import type { Address } from "../../src/types/index.js";
import { lickoRecipient, lickoSender } from "../support/addresses.js";
import { boundProvider } from "../support/bound-provider.js";

const DE_SENDER: Address = lickoSender();
const DE_RECIPIENT: Address = lickoRecipient("DE");

class CaptureAdapter implements ExecutionAdapter {
    readonly providerId = "deutschepost";
    readonly wireId = "internetmarke";
    requests: Array<{ origin?: unknown; destination?: unknown; value: number }> = [];

    async mark(request: {
        origin?: unknown;
        destination?: unknown;
        value: number;
    }): Promise<PortoMark> {
        this.requests.push(request);
        return buildPortoMark("deutschepost", "internetmarke", {
            content: "https://example.test/mark.png",
            contentType: "image/png",
            amount: request.value,
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

function executionOf(client: PortoClient): { execution: PortoExecution; adapter: CaptureAdapter } {
    const bound = boundProvider(client);
    const adapter = new CaptureAdapter();
    const execution = (bound as unknown as { execution: PortoExecution }).execution;
    execution.api = adapter;
    return { execution, adapter };
}

async function resolve(
    client: PortoClient,
    opts?: { serviceIds?: string[]; services?: string[]; weight?: number },
): Promise<Porto> {
    return boundProvider(client).resolve({
        countryCode: "DE",
        weight: opts?.weight ?? 20,
        services: opts?.services as Porto["services"] | undefined,
        serviceIds: opts?.serviceIds,
    });
}

describe("mark requires gates", () => {
    it("deutschepost stamp has empty requires", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolve(client);
        expect(porto.markType).toBe("stamp");
        expect(porto.requires).toEqual([]);
    });

    it("stamp strips extra addresses and allows many", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolve(client);
        const { execution, adapter } = executionOf(client);
        const prepared = await execution.prepare({
            porto,
            sender: DE_SENDER,
            recipient: DE_RECIPIENT,
        });
        expect(prepared.request.origin).toBeFalsy();
        expect(prepared.request.destination).toBeFalsy();

        const marks = await execution.mark([
            { porto } satisfies PortoMarkRequest,
            { porto } satisfies PortoMarkRequest,
        ]);
        expect(marks).toHaveLength(2);
        expect(adapter.requests).toHaveLength(2);
    });

    it("address-bearing many succeeds through core prepare", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = { ...(await resolve(client)), requires: [...ADDRESS] };
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark([
            { porto, sender: DE_SENDER, recipient: DE_RECIPIENT },
            { porto, sender: DE_SENDER, recipient: DE_RECIPIENT },
        ]);
        expect(marks).toHaveLength(2);
        expect(adapter.requests).toHaveLength(2);
    });

    it("mixed Portos succeed through core prepare in input order", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const small = await resolve(client);
        const large = await resolve(client, { weight: 400 });
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark([{ porto: small }, { porto: large }]);
        expect(marks).toHaveLength(2);
        expect(adapter.requests.map((row) => row.value)).toEqual([small.amount, large.amount]);
    });

    it("missing sender when required", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = {
            ...(await resolve(client)),
            requires: [SENDER, RECIPIENT],
        };
        const { execution } = executionOf(client);
        await expect(execution.mark({ porto, recipient: DE_RECIPIENT })).rejects.toMatchObject({
            code: PortoErrorCode.PORTO_ADDRESS_SENDER_REQUIRED,
        });
    });

    it("mark does not re-resolve", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolve(client);
        const { execution } = executionOf(client);
        const boom = {
            resolve: vi.fn(() => {
                throw new Error("mark must not re-resolve");
            }),
            getServicePrice: vi.fn(() => null),
        };
        execution.setResolver(boom as unknown as PortoResolver);
        await execution.mark({ porto });
        expect(boom.resolve).not.toHaveBeenCalled();
    });

    it("registered stamp does not require address", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolve(client, {
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(porto.requires.some((token) => ADDRESS.has(token))).toBe(false);
        const { execution, adapter } = executionOf(client);
        await execution.mark({ porto });
        expect(adapter.requests[0]?.origin).toBeFalsy();
        expect(adapter.requests[0]?.destination).toBeFalsy();
    });
});
