import { describe, expect, it } from "vitest";

import { PortoClient } from "../../src/browser.js";
import { PortoError, PortoErrorCode } from "../../src/errors.js";
import { boundProvider } from "../support/bound-provider.js";

describe("registered service kind uses generic resolve + catalog pins", () => {
    it("fails closed when registered has more than one option and no pin", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        await expect(
            boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered"],
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_SERVICE_AMBIGUOUS });
    });

    it("pins a chosen catalog id among registered options", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        const bound = boundProvider(client);
        const porto = await bound.resolve({
            countryCode: "DE",
            weight: 20,
            services: ["registered"],
            serviceIds: ["einschreiben"],
        });
        expect(porto.serviceIds).toContain("einschreiben");
        const serviceComponent = porto.components.find(
            (c) => c.kind === "service" && c.id === "einschreiben",
        );
        expect(serviceComponent?.amount).toBe(265);
    });

    it("rejects a pin whose kind is not the requested service", async () => {
        const client = new PortoClient({ providers: { deutschepost: {} } });
        await expect(
            boundProvider(client).resolve({
                countryCode: "DE",
                weight: 20,
                services: ["registered_return_receipt"],
                serviceIds: ["einschreiben"],
            }),
        ).rejects.toMatchObject({ code: PortoErrorCode.PORTO_DATA_INVALID });
    });
});
