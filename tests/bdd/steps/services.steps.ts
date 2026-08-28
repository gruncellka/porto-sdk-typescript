/**
 * Step definitions for services.feature — public resolve path only.
 */

import { Then } from "@cucumber/cucumber";
import { expect } from "expect";
import { bddContext as context } from "./bdd-context.js";

function availableServices(): Array<{ id?: string; kind?: string }> {
    return (context.porto?.availableServices as Array<{ id?: string; kind?: string }>) ?? [];
}

Then("available services should include {string}", (serviceId: string) => {
    const ids = new Set(availableServices().map((row) => row.id));
    expect(ids.has(serviceId)).toBe(true);
});

Then("each available service should have field {string}", (field: string) => {
    const rows = availableServices();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
        expect(field in row).toBe(true);
    }
});
