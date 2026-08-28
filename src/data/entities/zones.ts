/** Zones entity loader */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoZone {
    id: string;
    name: string;
    description: string;
    country_codes: string[];
    /** Optional English catalog label (porto-data ≥0.7.0). */
    label?: string;
}

export class ZonesLoader extends BaseEntityLoader {
    private zones: PortoZone[] = [];

    load(data: EntityData): void {
        const zonesData = data.zones ?? {};
        if (typeof zonesData === "object" && !Array.isArray(zonesData)) {
            this.zones = Object.entries(zonesData).map(([zoneId, zoneData]) => ({
                id: zoneId,
                ...(zoneData as Omit<PortoZone, "id">),
            }));
        } else {
            this.zones = (zonesData as PortoZone[]).map((z) => ({ ...z }));
        }
    }

    getData(): PortoZone[] {
        return this.zones;
    }

    getZone(zoneId: string): PortoZone | undefined {
        return this.zones.find((z) => z.id === zoneId);
    }

    getAllZones(): PortoZone[] {
        return this.zones;
    }

    getZoneByCountryCode(countryCode: string): PortoZone | undefined {
        return this.zones.find((z) => z.country_codes?.includes(countryCode));
    }
}
