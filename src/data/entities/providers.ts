/** Providers registry loader — providers.json */

import { BaseEntityLoader, type EntityData } from "./base";

export interface PortoProvider {
    id: string;
    name: string;
    country: string;
    mark_types: string[];
}

export class ProvidersLoader extends BaseEntityLoader {
    private providers: Map<string, PortoProvider> = new Map();

    load(data: EntityData): void {
        this.providers = new Map();
        const providers = data.providers ?? {};
        for (const [providerId, row] of Object.entries(providers)) {
            this.providers.set(providerId, {
                id: providerId,
                name: String((row as EntityData)?.name ?? providerId),
                country: String((row as EntityData)?.country ?? ""),
                mark_types: [...(((row as EntityData)?.mark_types as string[]) ?? [])],
            });
        }
    }

    getData(): Map<string, PortoProvider> {
        return this.providers;
    }

    getProvider(providerId: string): PortoProvider | undefined {
        return this.providers.get(providerId);
    }

    listProviders(): PortoProvider[] {
        return [...this.providers.values()];
    }
}
