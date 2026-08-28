import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";

import type { Balance, ExecutionAdapter } from "../../../src/adapters/protocols/execution.js";
import { buildPortoMark } from "../../../src/execution/index.js";
import type { PortoMark, PortoMarkRequest } from "../../../src/execution/index.js";
import type { ServiceKind } from "../../../src/kinds.js";
import { ADDRESS, RECIPIENT, SENDER } from "../../../src/requires.js";
import type { PortoExecution } from "../../../src/services/porto-execution.js";
import type { Porto } from "../../../src/services/porto-resolver.js";
import { CapabilityState } from "../../../src/states.js";
import type { Address } from "../../../src/types/index.js";
import { addressFromFixture, lickoRecipient, lickoSender } from "../../support/addresses.js";
import { boundProvider } from "../../support/bound-provider.js";
import { persistPaidManyArtifacts } from "../../support/paid-many-artifacts.js";
import { bddContext as context } from "./bdd-context.js";
import { publicResolve } from "./bdd-helpers.js";

const DE_SENDER: Address = lickoSender();
const DE_RECIPIENT: Address = lickoRecipient("DE");
const DE_INVALID: Address = {
    name: "x",
    street: "x",
    houseNumber: "1",
    postalCode: "1",
    locality: "x",
    countryCode: "DE",
};

class CaptureAdapter implements ExecutionAdapter {
    readonly providerId = "deutschepost";
    readonly wireId = "internetmarke";
    requests: unknown[] = [];

    async mark(request: { value: number }): Promise<PortoMark> {
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
        return {
            state: CapabilityState.Unavailable,
            detail: "capture adapter",
        };
    }

    normalizeDocument(payload: Uint8Array): Uint8Array {
        return payload;
    }
}

function captureError(error: unknown): { code: string; message: string } {
    return {
        code: (error as { code?: string })?.code ?? "",
        message: error instanceof Error ? error.message : String(error),
    };
}

function executionOf(client: NonNullable<typeof context.client>): PortoExecution {
    const bound = boundProvider(client);
    return (bound as unknown as { execution: PortoExecution }).execution;
}

function installCapture(client: NonNullable<typeof context.client>): void {
    executionOf(client).api = new CaptureAdapter();
}

function resetRoles(): void {
    context.sender = undefined;
    context.recipient = undefined;
    context.markError = undefined;
    context.resolvedPortos = undefined;
    context.mark = undefined;
    context.marks = undefined;
}

type CoverageCandidate = {
    countryCode: string;
    weight: number;
    serviceIds?: string[];
    services?: ServiceKind[];
};

const COVERAGE_CANDIDATES: Record<string, CoverageCandidate[]> = {
    "domestic base": [
        { countryCode: "DE", weight: 20 },
        { countryCode: "DE", weight: 50 },
        { countryCode: "DE", weight: 100 },
    ],
    "other-zone + service": [
        {
            countryCode: "FR",
            weight: 20,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
        {
            countryCode: "US",
            weight: 20,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
        {
            countryCode: "UA",
            weight: 20,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
        {
            countryCode: "FR",
            weight: 50,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
        {
            countryCode: "FR",
            weight: 100,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
    ],
    "feature-bearing": [
        {
            countryCode: "DE",
            weight: 20,
            serviceIds: ["einschreiben_rueckschein"],
            services: ["registered_return_receipt"],
        },
        {
            countryCode: "DE",
            weight: 50,
            serviceIds: ["einschreiben_rueckschein"],
            services: ["registered_return_receipt"],
        },
        {
            countryCode: "DE",
            weight: 100,
            serviceIds: ["einschreiben_rueckschein"],
            services: ["registered_return_receipt"],
        },
        {
            countryCode: "DE",
            weight: 20,
            serviceIds: ["einschreiben_einwurf"],
            services: ["registered"],
        },
        {
            countryCode: "DE",
            weight: 20,
            serviceIds: ["einschreiben"],
            services: ["registered"],
        },
    ],
};

async function resolvePorto(
    client: NonNullable<typeof context.client>,
    opts?: { serviceIds?: string[]; services?: string[]; weight?: number },
): Promise<Porto> {
    return boundProvider(client).resolve({
        countryCode: "DE",
        weight: opts?.weight ?? 20,
        services: opts?.services as Porto["services"] | undefined,
        serviceIds: opts?.serviceIds,
    });
}

function stampManyOk(porto: Porto): boolean {
    if (porto.markType != null && porto.markType !== "stamp") return false;
    return !porto.requires.some((token) => ADDRESS.has(token));
}

function matchesCoverage(porto: Porto, coverage: string): boolean {
    if (!stampManyOk(porto)) return false;
    if (coverage === "domestic base") {
        return porto.zone.id === "domestic" && porto.serviceIds.length === 0;
    }
    if (coverage === "other-zone + service") {
        return porto.zone.id !== "domestic" && porto.serviceIds.length > 0;
    }
    if (coverage === "feature-bearing") {
        if (porto.features.length > 0) return true;
        const selected = new Set(porto.serviceIds);
        return porto.availableServices.some(
            (svc) => selected.has(svc.id) && svc.features.length > 0,
        );
    }
    return false;
}

Given("a resolved stamp Porto", async () => {
    const client = context.client!;
    resetRoles();
    installCapture(client);
    context.resolvedPorto = await resolvePorto(client);
});

Given("the resolved Porto includes registered mail", async () => {
    const client = context.client!;
    resetRoles();
    installCapture(client);
    context.resolvedPorto = await resolvePorto(client, {
        services: ["registered"],
        serviceIds: ["einschreiben"],
    });
});

Given("a resolved Porto that requires ADDRESS_SENDER and ADDRESS_RECIPIENT", async () => {
    const client = context.client!;
    resetRoles();
    installCapture(client);
    const porto = await resolvePorto(client);
    context.resolvedPorto = { ...porto, requires: [SENDER, RECIPIENT] };
});

Given("recipient is valid", () => {
    context.recipient = DE_RECIPIENT;
});

Given("sender is missing", () => {
    context.sender = null;
});

Given("sender is valid", () => {
    context.sender = DE_SENDER;
});

Given("recipient is missing", () => {
    context.recipient = null;
});

Given("sender fails the jurisdiction form", () => {
    context.sender = DE_INVALID;
    context.recipient = DE_RECIPIENT;
});

Given("recipient fails the jurisdiction form", () => {
    context.sender = DE_SENDER;
    context.recipient = DE_INVALID;
});

Given("sender and recipient are valid", () => {
    context.sender = DE_SENDER;
    context.recipient = DE_RECIPIENT;
});

Given("two resolved Portos with different products", async () => {
    const client = context.client!;
    resetRoles();
    const small = await resolvePorto(client);
    const large = await resolvePorto(client, { weight: 400 });
    context.resolvedPorto = small;
    context.resolvedPortos = [small, large];
});

Given("the resolved Porto requires ADDRESS_RECIPIENT", async () => {
    const client = context.client!;
    resetRoles();
    const porto = await resolvePorto(client);
    context.resolvedPorto = { ...porto, requires: [RECIPIENT] };
});

Given("two equivalent stamp Portos", async () => {
    const client = context.client!;
    resetRoles();
    const porto = await resolvePorto(client);
    context.resolvedPorto = porto;
    context.resolvedPortos = [porto, porto];
});

Given("a third valid Porto that differs in product", async () => {
    const client = context.client!;
    const large = await resolvePorto(client, { weight: 400 });
    const portos = context.resolvedPortos ?? (context.resolvedPorto ? [context.resolvedPorto] : []);
    context.resolvedPortos = [...portos, large];
});

Given("a resolved stamp Porto covering {string}", async (coverage: string) => {
    const client = context.client!;
    resetRoles();
    const key = coverage.trim();
    const candidates = COVERAGE_CANDIDATES[key];
    if (!candidates) {
        throw new Error(`unknown coverage type ${JSON.stringify(coverage)}`);
    }
    let porto: Porto | undefined;
    for (const candidate of candidates) {
        try {
            const resolved = await boundProvider(client).resolve(candidate);
            if (matchesCoverage(resolved, key)) {
                porto = resolved;
                break;
            }
        } catch {
            // try the next catalog-valid combination
        }
    }
    if (!porto) {
        throw new Error(`no catalog-valid stamp Porto for coverage ${JSON.stringify(coverage)}`);
    }
    context.resolvedPorto = porto;
    context.coverage = key;
});

When("I create a mark without sender or recipient", async () => {
    const client = context.client!;
    const porto = context.resolvedPorto!;
    context.mark = (await boundProvider(client).mark({ porto })) as PortoMark;
    context.markError = undefined;
});

When("I create a mark", async () => {
    const client = context.client!;
    try {
        let porto = context.resolvedPorto;
        if (!porto) {
            porto = await publicResolve(context);
            context.resolvedPorto = porto;
        }
        const sender =
            context.sender ??
            (context.originAddress ? addressFromFixture(context.originAddress) : undefined);
        const recipient =
            context.recipient ??
            (context.destinationAddress
                ? addressFromFixture(context.destinationAddress)
                : undefined);
        context.mark = (await boundProvider(client).mark({
            porto,
            sender: sender ?? undefined,
            recipient: recipient ?? undefined,
        })) as PortoMark;
        context.markError = undefined;
    } catch (error: unknown) {
        context.markError = captureError(error);
        context.mark = undefined;
    }
});

When("I create three equivalent marks together", async () => {
    const client = context.client!;
    const porto = context.resolvedPorto!;
    context.marks = (await boundProvider(client).mark([
        { porto, sender: context.sender ?? undefined, recipient: context.recipient ?? undefined },
        { porto, sender: context.sender ?? undefined, recipient: context.recipient ?? undefined },
        { porto, sender: context.sender ?? undefined, recipient: context.recipient ?? undefined },
    ])) as PortoMark[];
    context.markError = undefined;
});

When("I attempt to create the marks together", async () => {
    const client = context.client!;
    const portos = context.resolvedPortos ?? [context.resolvedPorto!, context.resolvedPorto!];
    const requests: PortoMarkRequest[] = portos.map((porto) => ({
        porto,
        sender: context.sender ?? undefined,
        recipient: context.recipient ?? undefined,
    }));
    try {
        context.marks = (await boundProvider(client).mark(requests)) as PortoMark[];
        context.markError = undefined;
    } catch (error: unknown) {
        context.markError = captureError(error);
    }
});

Then("mark creation should succeed", () => {
    expect(context.markError).toBeUndefined();
    expect(context.mark !== undefined || context.marks !== undefined).toBe(true);
});

Then("the mark should be created successfully", () => {
    expect(context.markError).toBeUndefined();
    expect(context.mark).toBeDefined();
});

Then("the mark should have an id", () => {
    expect(context.mark?.id).toBeTruthy();
});

Then("three marks should be returned", () => {
    expect(context.markError).toBeUndefined();
    expect(context.marks).toHaveLength(3);
});

Then("every returned mark should have an id", () => {
    expect(context.marks).toBeDefined();
    for (const mark of context.marks ?? []) {
        expect(mark.id).toBeTruthy();
    }
});

Then("the returned mark ids should be distinct", () => {
    const marks = context.marks ?? [];
    const ids = marks.map((mark) => mark.id);
    expect(new Set(ids).size).toBe(ids.length);
});

Then("the returned marks should share one external id", async () => {
    const marks = context.marks ?? [];
    const externals = marks.map((mark) => mark.externalId);
    expect(externals.every(Boolean)).toBe(true);
    expect(new Set(externals).size).toBe(1);
    const adapter = executionOf(context.client!).api as {
        lastManyTrace?: Record<string, unknown> | null;
    };
    const slug = (context.coverage ?? "many").replace(/ /g, "-").replace(/\+/g, "plus");
    await persistPaidManyArtifacts({
        slug,
        marks,
        trace: adapter.lastManyTrace,
    });
});

Given("valid destination address for country {string}", (countryCode: string) => {
    context.recipient = lickoRecipient(countryCode as "DE" | "UA" | "FR" | "CH" | "US");
    context.destinationCountry = countryCode.trim().toUpperCase();
});
