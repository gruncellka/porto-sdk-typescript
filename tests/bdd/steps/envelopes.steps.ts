/**
 * Step definitions for metadata.feature (postal catalog + envelope matching).
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { PortoClient } from "../../../src/client.js";
import { resolvePortoDataPathForTests } from "../../support/porto-data-path.js";
import { bddContext as context } from "./bdd-context.js";

function getDataPath(): string {
    return resolvePortoDataPathForTests();
}

Given("I have a Porto SDK client initialized for provider {string}", (providerId: string) => {
    const dataPath = getDataPath();
    context.client = new PortoClient({
        data: dataPath,
        providers: { [providerId]: {} },
    });
    context.providerId = providerId;
});

When("I list envelope catalog", () => {
    context.envelopes = context.client?.envelopes.list();
});

When("I list envelopes for provider {string}", (_providerId: string) => {
    context.envelopes = context.client?.envelopes.list();
});

When("I list postal providers", () => {
    context.providers = context.client?.providers.list();
});

Then("the providers list should contain provider id {string}", (providerId: string) => {
    const ids = new Set(context.providers?.map((p) => p.id));
    expect(ids.has(providerId)).toBe(true);
});

When("I list products for provider {string}", (providerId: string) => {
    const home =
        { deutschepost: "DE", ukrposhta: "UA", laposte: "FR", swisspost: "CH" }[providerId] ?? "DE";
    context.products = context.client?.provider(providerId).options({
        countryCode: home,
        weight: 20,
    });
});

Then("the products list should contain product id {string}", (productId: string) => {
    const ids = new Set(context.products?.map((p) => p.id));
    expect(ids.has(productId)).toBe(true);
});

Then("the envelopes list should contain envelope id {string}", (envelopeId: string) => {
    const ids = new Set(context.envelopes?.map((e) => e.id));
    expect(ids.has(envelopeId)).toBe(true);
});

When(
    "I get envelope geometry for id {string} jurisdiction {string}",
    (envelopeId: string, jurisdiction: string) => {
        context.geometry = context.client?.envelopes.geometry(envelopeId, jurisdiction);
    },
);

Then("the envelope width should be {int} mm", (width: number) => {
    expect(context.geometry?.width).toBe(width);
});

Then("the envelope height should be {int} mm", (height: number) => {
    expect(context.geometry?.height).toBe(height);
});

When(
    "I validate envelope {string} for product {string}",
    (envelopeId: string, productId: string) => {
        context.match = context.client!.envelopes.validateForProduct(envelopeId, productId);
    },
);

When(
    "I resolve envelope {string} for product {string}",
    (envelopeId: string, productId: string) => {
        context.match = context.client!.envelopes.resolve({ kind: "by_id", envelopeId }, productId);
    },
);

Then("the match kind should be {string}", (kind: string) => {
    expect(context.match?.kind).toBe(kind);
});

Then("the match envelope id should be {string}", (envelopeId: string) => {
    expect(context.match?.kind !== "no_match" && context.match?.envelopeId).toBe(envelopeId);
});

Then("the match should have advisory_only {word}", (value: string) => {
    const expected = value.toLowerCase() === "true";
    if (context.match?.kind === "no_match") {
        throw new Error("Expected match with advisory_only, got no_match");
    }
    expect(context.match?.advisoryOnly).toBe(expected);
});

Then("the match reason should be {string}", (reason: string) => {
    if (context.match?.kind !== "advisory_match") {
        throw new Error(`Expected advisory_match, got ${context.match?.kind}`);
    }
    expect(context.match?.reason).toBe(reason);
});
