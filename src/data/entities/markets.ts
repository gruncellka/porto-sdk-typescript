/** Markets entity loader — policy/markets.json */

import { BaseEntityLoader, type EntityData } from "./base";

export interface WorkingDays {
    weekdays: "mon_fri" | "mon_sat";
    exclude_public_holidays: boolean;
}

export interface PortoMarket {
    country_code: string;
    currency: string;
    working_days: WorkingDays;
    vat?: Record<string, unknown>;
    international_currency?: string[];
}

export class MarketsLoader extends BaseEntityLoader {
    private markets: Map<string, PortoMarket> = new Map();

    load(data: EntityData): void {
        this.markets = new Map();
        const rows = (data.markets ?? {}) as Record<string, Record<string, unknown>>;
        for (const [countryCode, row] of Object.entries(rows)) {
            const wd = (row.working_days ?? {}) as Record<string, unknown>;
            this.markets.set(countryCode, {
                country_code: countryCode,
                currency: String(row.currency ?? ""),
                working_days: {
                    weekdays: (wd.weekdays as WorkingDays["weekdays"]) ?? "mon_fri",
                    exclude_public_holidays: Boolean(wd.exclude_public_holidays ?? true),
                },
                vat: row.vat as Record<string, unknown> | undefined,
                international_currency: row.international_currency as string[] | undefined,
            });
        }
    }

    getData(): Map<string, PortoMarket> {
        return this.markets;
    }

    getMarket(countryCode: string): PortoMarket | undefined {
        return this.markets.get(countryCode.toUpperCase());
    }
}
