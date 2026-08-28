/** Envelopes entity loader — formats/envelopes.json */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoEnvelope {
    id: string;
    label: string;
    width: number;
    height: number;
    standards: string[];
    sheets: EntityData[];
    notes?: string;
}

export class EnvelopesLoader extends BaseEntityLoader {
    private envelopes: Map<string, PortoEnvelope> = new Map();

    load(data: EntityData): void {
        this.envelopes = new Map();
        for (const row of data.envelopes ?? []) {
            const rawStandards = row.standards;
            const standards = Array.isArray(rawStandards)
                ? rawStandards.map((item) => String(item))
                : row.standard
                  ? [String(row.standard)]
                  : [];
            const envelope: PortoEnvelope = {
                id: String(row.id),
                label: String(row.label ?? row.id),
                width: Number(row.width),
                height: Number(row.height),
                standards,
                sheets: [...(row.sheets ?? [])],
                notes: row.notes,
            };
            this.envelopes.set(envelope.id, envelope);
        }
    }

    getData(): Map<string, PortoEnvelope> {
        return this.envelopes;
    }

    getEnvelope(envelopeId: string): PortoEnvelope | undefined {
        return this.envelopes.get(envelopeId);
    }

    listEnvelopes(): PortoEnvelope[] {
        return [...this.envelopes.values()];
    }

    allIds(): Set<string> {
        return new Set(this.envelopes.keys());
    }
}
