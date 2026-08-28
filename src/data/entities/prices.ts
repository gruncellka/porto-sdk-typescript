/**
 * Prices Entity Loader
 *
 * Handles loading and querying prices entity.
 */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoPricing {
    product_id: string;
    zone: string;
    weight_tier: string;
    price: number; // cents - current active price
    /** ISO 4217 from price row or file unit; null → provider graph default */
    currency: string | null;
    effective_from: string | null;
    effective_to: string | null;
}

export class PricesLoader extends BaseEntityLoader {
    private prices: PortoPricing[] = [];
    private servicePrices: Map<string, number> = new Map();
    private zonedServiceIds = new Set<string>();

    private servicePriceKey(serviceId: string, zoneId: string | null): string {
        return `${serviceId}\0${zoneId ?? ""}`;
    }

    private ingestServicePriceRow(sp: Record<string, unknown>): void {
        const serviceId = sp.service_id as string | undefined;
        const priceEntries = (sp.price as Array<Record<string, unknown>>) ?? [];
        if (!serviceId || priceEntries.length === 0) return;
        const first = priceEntries[0];
        const amount = typeof first.amount === "number" ? first.amount : Number(first.price || 0);
        const zone = typeof sp.zone === "string" && sp.zone ? sp.zone : null;
        this.servicePrices.set(this.servicePriceKey(serviceId, zone), amount);
        if (zone) this.zonedServiceIds.add(serviceId);
    }

    load(data: EntityData): void {
        /**
         * Transform prices JSON to PortoPricing objects
         *
         * Extracts current active price from price array (first entry).
         * Currency: row override → file unit → null (caller uses provider default).
         */
        const productPricesData = data.prices?.product_prices || data.product_prices || [];
        const fileUnit = (data.unit ?? data.prices?.unit) as { currency?: string } | undefined;
        const fileCurrency =
            typeof fileUnit?.currency === "string" && fileUnit.currency.trim()
                ? fileUnit.currency.trim().toUpperCase()
                : null;
        this.prices = [];

        for (const pp of productPricesData) {
            const priceEntries = pp.price || [];
            const currentPrice = priceEntries[0] || { amount: 0, price: 0 };
            const effectiveFrom = currentPrice.effective_from;
            const effectiveTo = currentPrice.effective_to;
            const amount =
                typeof currentPrice.amount === "number"
                    ? currentPrice.amount
                    : Number(currentPrice.price || 0);
            const rowCurrency =
                typeof pp.currency === "string" && pp.currency.trim()
                    ? String(pp.currency).trim().toUpperCase()
                    : null;

            this.prices.push({
                product_id: pp.product_id,
                zone: pp.zone,
                weight_tier: pp.weight_tier,
                price: amount,
                currency: rowCurrency ?? fileCurrency,
                effective_from: effectiveFrom != null ? String(effectiveFrom) : null,
                effective_to: effectiveTo != null ? String(effectiveTo) : null,
            });
        }

        // Load service_prices keyed by catalog service id and optional zone
        const servicePricesData = data.prices?.service_prices || [];
        this.servicePrices.clear();
        this.zonedServiceIds.clear();
        for (const sp of servicePricesData) {
            this.ingestServicePriceRow(sp);
        }
    }

    getData(): PortoPricing[] {
        /** Get all prices */
        return this.prices;
    }

    /**
     * Get pricing for product, zone, and weight_tier combination
     *
     * Returns the current active price.
     */
    getPricing(productId: string, zoneId: string, weightTier: string): PortoPricing | null {
        return (
            this.prices.find(
                (p) =>
                    p.product_id === productId && p.zone === zoneId && p.weight_tier === weightTier,
            ) || null
        );
    }

    getPricesForProduct(productId: string): PortoPricing[] {
        /** Get all prices for a product */
        return this.prices.filter((p) => p.product_id === productId);
    }

    getPricesForZone(zoneId: string): PortoPricing[] {
        /** Get all prices for a zone */
        return this.prices.filter((p) => p.zone === zoneId);
    }

    /**
     * Get price for a service by catalog id.
     * Zoned rows require zoneId. Unzoned rows apply regardless of zone.
     * Returns amount in cents, or null if not found.
     */
    getServicePrice(serviceId: string, zoneId?: string | null): number | null {
        if (this.zonedServiceIds.has(serviceId)) {
            if (!zoneId) return null;
            const v = this.servicePrices.get(this.servicePriceKey(serviceId, zoneId));
            return v !== undefined ? v : null;
        }
        const v = this.servicePrices.get(this.servicePriceKey(serviceId, null));
        return v !== undefined ? v : null;
    }

    loadServicePrices(data: EntityData): void {
        for (const sp of (data.service_prices as Array<Record<string, unknown>>) ?? []) {
            this.ingestServicePriceRow(sp);
        }
    }
}
