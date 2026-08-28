/**
 * Step definitions for restrictions.feature
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { bddContext as context } from "./bdd-context.js";
import { loadAddressFixture, providerIdFromContext } from "./bdd-helpers.js";

function lookup() {
    const client = context.client!;
    const providerId = providerIdFromContext(context);
    const country = context.destinationCountry ?? "DE";
    return client.provider(providerId).restrictions.check(country, context.destinationRegion);
}

function legalItems() {
    return context.restrictionLookup?.legal ?? [];
}

function routingItems() {
    return context.restrictionLookup?.routing ?? [];
}

function jurisdictionBlob(): string {
    return legalItems()
        .flatMap((item) => ("jurisdictions" in item ? item.jurisdictions : []))
        .flatMap((row) => [row.reference ?? "", row.jurisdiction ?? ""])
        .join(" ");
}

Given("I want to send a letter to a restricted country", () => {
    context.destinationCountry = "UA";
    context.destinationRegion = "UA-14";
});

Given("the destination country has restrictions", () => {
    context.destinationCountry = "UA";
});

Given("I have destination address fixture {string}", (fixtureId: string) => {
    context.destinationAddress = loadAddressFixture(fixtureId);
});

Given("destination region code is {string}", (regionCode: string) => {
    context.destinationRegion = regionCode;
});

When("I check destination restrictions", () => {
    context.restrictionLookup = lookup();
});

Then("the restriction result impact should be {string}", (impact: string) => {
    expect(context.restrictionLookup?.impact).toBe(impact);
});

Then("the restriction result impact should be null", () => {
    expect(context.restrictionLookup?.impact).toBeNull();
});

Then("the restriction result list should be empty", () => {
    expect(context.restrictionLookup?.legal ?? []).toEqual([]);
    expect(context.restrictionLookup?.routing ?? []).toEqual([]);
});

Then("the restriction result should include legal region {string}", (regionCode: string) => {
    expect(legalItems().some((item) => item.regionCode === regionCode)).toBe(true);
});

Then("the restriction result should not include legal region {string}", (regionCode: string) => {
    expect(legalItems().every((item) => item.regionCode !== regionCode)).toBe(true);
});

Then("the restriction result legal region {string} should be partial", (regionCode: string) => {
    const matches = legalItems().filter((item) => item.regionCode === regionCode);
    expect(matches.length > 0 && matches.every((item) => item.partial)).toBe(true);
});

Then("the restriction result legal jurisdictions should include {string}", (token: string) => {
    expect(jurisdictionBlob()).toContain(token);
});

Then("the restriction result legal jurisdictions should not include {string}", (token: string) => {
    expect(jurisdictionBlob()).not.toContain(token);
});

Then("the restriction result should include routing region {string}", (regionCode: string) => {
    expect(routingItems().some((item) => item.regionCode === regionCode)).toBe(true);
});

Then("the restriction result routing authority should be {string}", (authority: string) => {
    expect(routingItems().some((item) => item.authority === authority)).toBe(true);
});

Then("the restriction result routing region {string} should be partial", (regionCode: string) => {
    const matches = routingItems().filter((item) => item.regionCode === regionCode);
    expect(matches.length > 0 && matches.every((item) => item.partial)).toBe(true);
});

Then("the resolved Porto restrictions should have no impact", () => {
    expect(context.porto?.restrictions?.impact).toBeNull();
});

Then("the resolved Porto restrictions list should be empty", () => {
    expect(context.porto?.restrictions?.legal ?? []).toEqual([]);
    expect(context.porto?.restrictions?.routing ?? []).toEqual([]);
});

Then("the resolved Porto restrictions should match standalone restriction lookup", () => {
    const standalone = lookup();
    const resolved = context.porto!.restrictions!;
    expect(resolved).toEqual(standalone);
});
