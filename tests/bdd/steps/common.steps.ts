/**
 * Canonical BDD vocabulary aliases shared with porto-features.
 */

import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import { PortoClient } from "../../../src/client.js";
import { addressFromFixture, loadAddressFixture } from "../../support/addresses.js";
import { resolvePortoDataPathForTests } from "../../support/porto-data-path.js";
import { bddContext as context } from "./bdd-context.js";
import { resolvePrice } from "./bdd-helpers.js";

Given("I have a Porto SDK client initialized", () => {
    if (!context.client) {
        context.client = new PortoClient({ data: resolvePortoDataPathForTests() });
    }
});

Given("I have access to porto-data", () => {
    expect(context.client).toBeDefined();
    expect(context.client!.envelopes.list().length).toBeGreaterThan(0);
});

Given("I want to send a letter to country {string}", (countryCode: string) => {
    context.destinationCountry = countryCode;
});

Given(/^(?:a )?(?:valid |domestic )?sender$/, () => {
    context.originAddress = loadAddressFixture("origin_DE");
    context.sender = addressFromFixture("origin_DE");
});

Given(/^(?:a )?recipient$/, () => {
    context.destinationAddress = loadAddressFixture("valid_DE");
    context.recipient = addressFromFixture("valid_DE");
});

Given("valid destination address", () => {
    context.destinationAddress = loadAddressFixture("valid_DE");
    context.recipient = addressFromFixture("valid_DE");
});

Given("valid origin address", () => {
    context.originAddress = loadAddressFixture("origin_DE");
    context.sender = addressFromFixture("origin_DE");
});

Given(/^a letter product "([^"]+)"$/, (productId: string) => {
    context.productId = productId;
});

Given(/^weight (\d+) grams$/, (raw: string) => {
    const weight = Number(raw);
    context.weight = weight;
    context.letterWeight = weight;
});

Given("I have weight {int} grams", (weight: number) => {
    context.weight = weight;
    context.letterWeight = weight;
});

When("calculate postage", async () => {
    await resolvePrice(context);
});

Then("price should be returned", () => {
    expect(context.price).toBeDefined();
    expect(typeof context.price).toBe("number");
    expect(context.price!).toBeGreaterThan(0);
});

Given("the destination country is {string}", (country: string) => {
    context.destinationCountry = country;
});

Given("service kind is {string}", (kind: string) => {
    context.servicesKinds = [...(context.servicesKinds ?? []), kind];
    context.serviceKind = kind;
});

Given("I have a letter with base price", async () => {
    await resolvePrice(context);
});

When("I add the service to the order", () => {
    context.order = context.order ?? { services: [] as string[] };
    context.order.services.push(context.requestedService!);
});

Then("the order should include service {string}", (serviceId: string) => {
    expect(context.order?.services).toContain(serviceId);
});
