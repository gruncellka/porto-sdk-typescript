/**
 * Step definitions for data.feature
 */

import { Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { bddContext as context } from "./bdd-context.js";

function items(key: keyof typeof context): unknown[] {
    const value = context[key];
    expect(Array.isArray(value)).toBe(true);
    return value as unknown[];
}

/** Gherkin uses catalog snake_case; TS public fields are camelCase. */
function hasField(item: Record<string, unknown>, field: string): boolean {
    if (field in item) return true;
    if (!field.includes("_")) return false;
    const camel = field.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    return camel in item;
}

When("I inspect envelopes data", () => {
    context.envelopes = context.client!.envelopes.list() as Record<string, unknown>[];
});

When("I inspect the provider registry", () => {
    context.providersData = {
        providers: context.client!.providers.list().map((provider) => ({
            id: provider.id,
            name: provider.name,
            country: provider.country,
        })),
    };
});

When("I look up country code 3 for {string}", (countryCode: string) => {
    context.countryCode3 = context.client!.jurisdictions.countryCode3(countryCode);
});

Then("I should get providers information", () => {
    expect(typeof context.providersData).toBe("object");
});

Then("the country code 3 should be {string}", (countryCode3: string) => {
    expect(context.countryCode3).toBe(countryCode3);
});

Then("I should get an array of envelopes", () => {
    items("envelopes");
});

Then("the envelopes array should contain envelope with id {string}", (envelopeId: string) => {
    const ids = new Set(items("envelopes").map((item) => (item as Record<string, unknown>).id));
    expect(ids.has(envelopeId)).toBe(true);
});

Then("each envelope should have field {string}", (field: string) => {
    for (const item of items("envelopes") as Record<string, unknown>[]) {
        expect(hasField(item, field)).toBe(true);
    }
});

Then("providers should include provider {string}", (providerId: string) => {
    const providers = (context.providersData?.providers ?? []) as Record<string, unknown>[];
    const ids = new Set(providers.map((row) => row.id));
    expect(ids.has(providerId)).toBe(true);
});
