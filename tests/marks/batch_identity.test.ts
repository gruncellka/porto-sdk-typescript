import { describe, expect, it } from "vitest";

import type { Balance, ExecutionAdapter } from "../../src/adapters/protocols/execution.js";
import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { buildPortoMark } from "../../src/execution/index.js";
import type { PortoMark, PortoMarkRequest } from "../../src/execution/index.js";
import type { PortoExecution } from "../../src/services/porto-execution.js";
import type { Porto } from "../../src/services/porto-resolver.js";
import { CapabilityState } from "../../src/states.js";
import type { Address, MarkRequest } from "../../src/types/index.js";
import { lickoRecipient, lickoSender } from "../support/addresses.js";
import { boundProvider } from "../support/bound-provider.js";

const DE_SENDER: Address = lickoSender();
const DE_RECIPIENT: Address = lickoRecipient("DE");

class CaptureAdapter implements ExecutionAdapter {
    readonly providerId = "deutschepost";
    readonly wireId = "internetmarke";
    requests: MarkRequest[] = [];

    async mark(request: MarkRequest): Promise<PortoMark> {
        this.requests.push(request);
        return buildPortoMark("deutschepost", "internetmarke", {
            content: `https://example.test/mark-${this.requests.length}.png`,
            contentType: "image/png",
            amount: request.value,
            externalId: request.idempotencyKey,
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

async function resolveStamp(client: PortoClient, opts?: { weight?: number }): Promise<Porto> {
    return boundProvider(client).resolve({
        countryCode: "DE",
        weight: opts?.weight ?? 20,
    });
}

function requests(...portos: Porto[]): PortoMarkRequest[] {
    return portos.map((porto) => ({ porto }));
}

async function expectCode(
    execution: PortoExecution,
    items: PortoMarkRequest[],
    code: PortoErrorCode,
): Promise<PortoError> {
    try {
        await execution.mark(items);
        throw new Error(`expected ${code}`);
    } catch (error) {
        expect(error).toBeInstanceOf(PortoError);
        const portoError = error as PortoError;
        expect(portoError.code).toBe(code);
        return portoError;
    }
}

describe("mark(many) dispatch without markMany", () => {
    it.each([1, 2, 3])("accepts %i equal stamp items", async (count) => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolveStamp(client);
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark(requests(...Array.from({ length: count }, () => porto)));
        expect(marks).toHaveLength(count);
        expect(adapter.requests).toHaveLength(count);
        expect(new Set(marks.map((mark) => mark.id)).size).toBe(count);
        expect(new Set(marks.map((mark) => mark.wire))).toEqual(new Set(["internetmarke"]));
    });

    it("rejects an empty collection", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const { execution, adapter } = executionOf(client);
        await expectCode(execution, [], PortoErrorCode.PORTO_MARK_INVALID);
        expect(adapter.requests).toHaveLength(0);
    });

    it("dispatches mixed Portos in input order when the adapter has no markMany", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolveStamp(client);
        const other = await resolveStamp(client, { weight: 400 });
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark(requests(porto, other, porto));
        expect(marks).toHaveLength(3);
        expect(adapter.requests.map((row) => row.value)).toEqual([
            porto.amount,
            other.amount,
            porto.amount,
        ]);
    });

    it("ignores per-item idempotency, mime, and unused addresses", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolveStamp(client);
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark([
            { porto, idempotency: "one", mime: "image/png", sender: DE_SENDER },
            { porto, idempotency: "two", mime: "application/pdf", recipient: DE_RECIPIENT },
            { porto, idempotency: "three" },
        ]);
        expect(marks).toHaveLength(3);
        expect(adapter.requests.map((row) => row.idempotencyKey)).toEqual(["one", "two", "three"]);
    });

    it("returns three positional marks with distinct ids", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const porto = await resolveStamp(client);
        const { execution, adapter } = executionOf(client);
        const marks = await execution.mark([
            { porto, idempotency: "pos-0" },
            { porto, idempotency: "pos-1" },
            { porto, idempotency: "pos-2" },
        ]);
        expect(marks.map((mark) => mark.externalId)).toEqual(["pos-0", "pos-1", "pos-2"]);
        expect(new Set(marks.map((mark) => mark.id)).size).toBe(3);
        expect(new Set(marks.map((mark) => mark.wire))).toEqual(new Set(["internetmarke"]));
        expect(adapter.requests).toHaveLength(3);
    });
});
