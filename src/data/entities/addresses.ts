/** Addresses entity loader — formats/addresses.json */

import { BaseEntityLoader, type EntityData } from "./base";

export interface AddressFormKind {
    kind: string;
    required: string[];
}

export interface AddressForm {
    jurisdiction: string;
    standard: string;
    postal_code_pattern: string;
    forms: AddressFormKind[];
    max_line_length?: number;
    raw: EntityData;
    postalCodeRe(): RegExp;
    getKind(kind: string): AddressFormKind | undefined;
}

class AddressFormImpl implements AddressForm {
    private compiled?: RegExp;

    constructor(
        readonly jurisdiction: string,
        readonly standard: string,
        readonly postal_code_pattern: string,
        readonly forms: AddressFormKind[],
        readonly max_line_length: number | undefined,
        readonly raw: EntityData,
    ) {}

    postalCodeRe(): RegExp {
        if (!this.compiled) {
            this.compiled = new RegExp(this.postal_code_pattern);
        }
        return this.compiled;
    }

    getKind(kind: string): AddressFormKind | undefined {
        return this.forms.find((f) => f.kind === kind);
    }
}

export class AddressesLoader extends BaseEntityLoader {
    private forms: Map<string, AddressForm> = new Map();

    load(data: EntityData): void {
        this.forms = new Map();
        const jurisdictions = data.jurisdictions ?? {};
        for (const [jurisdiction, payload] of Object.entries(jurisdictions)) {
            if (!payload || typeof payload !== "object") continue;
            const row = payload as EntityData;
            const postal = (row.postal_code ?? {}) as EntityData;
            const pattern = postal.pattern;
            if (typeof pattern !== "string" || !pattern) continue;
            const standard = row.standard;
            if (typeof standard !== "string" || !standard) continue;
            const formsRaw = Array.isArray(row.forms) ? row.forms : [];
            const kinds: AddressFormKind[] = [];
            for (const formRow of formsRaw) {
                if (!formRow || typeof formRow !== "object") continue;
                const fr = formRow as EntityData;
                if (typeof fr.kind !== "string" || !Array.isArray(fr.required)) continue;
                kinds.push({
                    kind: fr.kind,
                    required: fr.required.map((f) => String(f)),
                });
            }
            if (!kinds.length) continue;
            const maxLine =
                typeof row.max_line_length === "number" ? row.max_line_length : undefined;
            const key = jurisdiction.toUpperCase();
            this.forms.set(key, new AddressFormImpl(key, standard, pattern, kinds, maxLine, row));
        }
    }

    getData(): Map<string, AddressForm> {
        return this.forms;
    }

    getForm(jurisdiction: string): AddressForm | undefined {
        return this.forms.get(jurisdiction.toUpperCase());
    }
}
