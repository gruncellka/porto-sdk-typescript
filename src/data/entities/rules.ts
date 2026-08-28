/**
 * Provider conditional rules (e.g. Swiss Post thickness surcharge).
 */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoProviderRules {
    rules: Record<string, unknown>[];
}

export class RulesLoader extends BaseEntityLoader {
    private rules: PortoProviderRules = { rules: [] };

    load(data: EntityData): void {
        this.rules = { rules: (data.rules as Record<string, unknown>[]) ?? [] };
    }

    getData(): PortoProviderRules {
        return this.rules;
    }

    getRules(): Record<string, unknown>[] {
        return this.rules.rules;
    }
}
