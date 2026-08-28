/** Delivery hint resolution from products.delivery[] + markets.working_days. */

import type { DeliveryEntry } from "../../data/entities/products.js";
import type { PortoDataLoader, PortoProduct } from "../../data/loader.js";

export interface WorkingDaysHint {
    market: string;
    weekdays: "mon_fri" | "mon_sat";
    excludePublicHolidays: boolean;
}

export interface DeliveryHint {
    span: "next" | "within" | "between";
    daysMax: number;
    daysMin?: number | null;
    workingDays: WorkingDaysHint;
}

export type DeliveryPreference = "fastest" | "cheapest" | "economy";

export class DeliveryResolver {
    constructor(
        private readonly loader: PortoDataLoader,
        private readonly providerId: string,
    ) {}

    findDeliveryEntry(product: PortoProduct, zoneId: string): DeliveryEntry | undefined {
        return product.delivery.find((entry) => entry.zones.includes(zoneId));
    }

    resolve(product: PortoProduct, zoneId: string): DeliveryHint | undefined {
        const entry = this.findDeliveryEntry(product, zoneId);
        if (!entry) return undefined;

        const provider = this.loader.getProvider(this.providerId);
        if (!provider) return undefined;
        const market = this.loader.getMarket(provider.country);
        if (!market) return undefined;

        const weekdays = entry.weekdays ?? market.working_days.weekdays;
        return {
            span: entry.span,
            daysMax: entry.days_max,
            daysMin: entry.days_min,
            workingDays: {
                market: market.country_code,
                weekdays,
                excludePublicHolidays: market.working_days.exclude_public_holidays,
            },
        };
    }

    deliveryFingerprint(product: PortoProduct, zoneId: string): string | undefined {
        const entry = this.findDeliveryEntry(product, zoneId);
        if (!entry) return undefined;
        return `${entry.span}:${entry.days_min ?? ""}:${entry.days_max}:${entry.weekdays ?? ""}`;
    }
}
