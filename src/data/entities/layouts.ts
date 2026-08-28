/** Layouts entity loader — formats/layouts.json */

import { BaseEntityLoader, type EntityData } from "./base";

export interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface EnvelopeLayout {
    envelope_id: string;
    jurisdiction: string;
    standard?: string;
    orientation?: string;
    window_supported: boolean;
    window_area?: LayoutRect;
    raw: EntityData;
}

export class LayoutsLoader extends BaseEntityLoader {
    private layouts: Map<string, Map<string, EnvelopeLayout>> = new Map();

    load(data: EntityData): void {
        this.layouts = new Map();
        const jurisdictions = data.jurisdictions ?? {};
        for (const [jurisdiction, payload] of Object.entries(jurisdictions)) {
            const envelopes = (payload as EntityData)?.envelopes ?? {};
            const bucket = new Map<string, EnvelopeLayout>();
            for (const [envelopeId, envelopeData] of Object.entries(envelopes)) {
                const layout = ((envelopeData as EntityData)?.layout ?? {}) as EntityData;
                const window = (layout.window ?? {}) as EntityData;
                bucket.set(envelopeId, {
                    envelope_id: envelopeId,
                    jurisdiction,
                    standard: (envelopeData as EntityData)?.standard,
                    orientation: (envelopeData as EntityData)?.orientation,
                    window_supported: Boolean(window.supported),
                    window_area: LayoutsLoader.rect(window.area),
                    raw: (envelopeData as EntityData) ?? {},
                });
            }
            this.layouts.set(jurisdiction, bucket);
        }
    }

    getData(): Map<string, Map<string, EnvelopeLayout>> {
        return this.layouts;
    }

    getLayout(jurisdiction: string, envelopeId: string): EnvelopeLayout | undefined {
        return this.layouts.get(jurisdiction)?.get(envelopeId);
    }

    private static rect(raw: unknown): LayoutRect | undefined {
        if (!raw || typeof raw !== "object") return undefined;
        const value = raw as Record<string, unknown>;
        try {
            return {
                x: Number(value.x),
                y: Number(value.y),
                width: Number(value.width),
                height: Number(value.height),
            };
        } catch {
            return undefined;
        }
    }
}
