/** Shared helpers for BDD step definitions (mirrors Python tests/bdd/steps/helpers.py). */

import type { ServiceKind } from "../../../src/kinds.js";
import { addressFromFixture, loadAddressFixture } from "../../support/addresses.js";
import { boundProvider } from "../../support/bound-provider.js";
import type { BddContext } from "./bdd-context.js";

export { addressFromFixture, loadAddressFixture };

export function weightFromContext(context: BddContext, defaultWeight = 20): number {
    return context.weight ?? context.letterWeight ?? defaultWeight;
}

export function countryFromContext(context: BddContext, defaultCountry = "DE"): string {
    return context.destinationCountry ?? defaultCountry;
}

export const PROVIDER_HOME_COUNTRY: Record<string, string> = {
    deutschepost: "DE",
    ukrposhta: "UA",
    laposte: "FR",
    swisspost: "CH",
};

/** Example country per catalog zone — maps CLI "data price" zone args onto public price(). */
export const ZONE_EXAMPLE_COUNTRY: Record<string, Record<string, string>> = {
    deutschepost: {
        domestic: "DE",
        zone_1_eu: "FR",
        zone_2_europe: "UA",
        world: "US",
    },
    laposte: {
        domestic: "FR",
        zone_1_eu: "BE",
        world: "US",
    },
    ukrposhta: {
        domestic: "UA",
        world: "US",
    },
    swisspost: {
        domestic: "CH",
        zone_1_eu: "DE",
        world: "US",
    },
};

export function providerIdFromContext(context: BddContext, fallback = "deutschepost"): string {
    return context.providerId ?? fallback;
}

export function providerHomeCountry(context: BddContext): string {
    return PROVIDER_HOME_COUNTRY[providerIdFromContext(context)] ?? "DE";
}

export function countryForZone(providerId: string, zoneId: string): string {
    const byProvider = ZONE_EXAMPLE_COUNTRY[providerId] ?? {};
    if (zoneId in byProvider) {
        return byProvider[zoneId]!;
    }
    return PROVIDER_HOME_COUNTRY[providerId] ?? "DE";
}

export function bound(context: BddContext) {
    return boundProvider(context.client!, providerIdFromContext(context));
}

export function resolveInputFromContext(
    context: BddContext,
    overrides: {
        countryCode?: string;
        weight?: number;
        envelopeId?: string;
        productId?: string;
        deliveryPreference?: BddContext["deliveryPreference"];
        services?: ServiceKind[];
        serviceIds?: string[];
        indemnityTier?: string;
    } = {},
) {
    const serviceIds = overrides.serviceIds ?? context.serviceIds;
    let services = (overrides.services ?? context.servicesKinds) as ServiceKind[] | undefined;
    if (serviceIds?.length && (!services || services.length === 0)) {
        services = serviceKindsForIds(context, serviceIds);
    }
    return {
        countryCode: overrides.countryCode ?? countryFromContext(context),
        weight: overrides.weight ?? weightFromContext(context),
        envelopeId: overrides.envelopeId ?? context.envelopeId,
        productId: overrides.productId ?? context.productId,
        deliveryPreference: overrides.deliveryPreference ?? context.deliveryPreference,
        services,
        serviceIds: serviceIds?.length ? serviceIds : undefined,
        indemnityTier: overrides.indemnityTier,
    };
}

function serviceKindsForIds(_context: BddContext, serviceIds: string[]): ServiceKind[] {
    const kindById: Record<string, ServiceKind> = {
        einschreiben: "registered",
        einschreiben_einwurf: "registered",
        einschreiben_rueckschein: "registered_return_receipt",
    };
    const kinds: ServiceKind[] = [];
    const seen = new Set<string>();
    for (const serviceId of serviceIds) {
        const kind = kindById[serviceId];
        if (kind && !seen.has(kind)) {
            seen.add(kind);
            kinds.push(kind);
        }
    }
    return kinds;
}

export async function publicResolve(
    context: BddContext,
    overrides?: Parameters<typeof resolveInputFromContext>[1],
) {
    return bound(context).resolve(resolveInputFromContext(context, overrides));
}

export async function publicPrice(
    context: BddContext,
    overrides?: Parameters<typeof resolveInputFromContext>[1],
) {
    return bound(context).price(resolveInputFromContext(context, overrides));
}

export async function resolvePrice(context: BddContext): Promise<number> {
    const pricing = await publicPrice(context);
    context.pricing = pricing;
    context.price = pricing.amount;
    context.quotedAmount = pricing.amount;
    return pricing.amount;
}

export function buildLetterPayload(context: BddContext): ReturnType<typeof letterPayload> {
    return letterPayload(context);
}

function letterPayload(context: BddContext) {
    const originRaw = context.originAddress ?? loadAddressFixture("origin_DE");
    const destinationRaw = context.destinationAddress ?? loadAddressFixture("valid_DE");
    const destination = context.destinationCountry
        ? { ...destinationRaw, country_code: context.destinationCountry }
        : destinationRaw;

    return {
        weight: weightFromContext(context),
        dimensions: {
            length: context.letterLength ?? 210,
            width: context.letterWidth ?? 148,
            height: context.letterHeight ?? 5,
        },
        origin: addressFromFixture(originRaw),
        destination: {
            ...addressFromFixture(destination),
            regionCode: context.destinationRegion ?? addressFromFixture(destination).regionCode,
        },
    };
}

export async function productReferenceAmount(
    context: BddContext,
    productId: string,
): Promise<number> {
    const home = countryFromContext(context, providerHomeCountry(context));
    const client = bound(context);
    for (const weight of [20, 50, 100, 500, 1000, 2000]) {
        const rows = await Promise.resolve(client.options({ countryCode: home, weight }));
        const match = rows.find((row) => row.id === productId && row.amount != null);
        if (match?.amount != null) {
            return match.amount;
        }
    }
    throw new Error(`public options() did not yield product ${productId}`);
}
