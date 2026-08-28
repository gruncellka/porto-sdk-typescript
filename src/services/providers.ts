/** Providers subservice — read projection over porto-data */

import {
    getDefaultWireId,
    listWireBillingMethods,
    listWireExecutionMethods,
    supportsBilling,
    supportsExecution,
} from "../adapters/execution-registry.js";
import type { PortoConfig } from "../config.js";
import type { PortoProvider } from "../data/entities/providers";
import type { PortoDataLoader } from "../data/loader";
import { ProviderCapabilitiesService } from "./provider-capabilities";

export class ProvidersService {
    constructor(private readonly loader: PortoDataLoader) {}

    list(): PortoProvider[] {
        return this.loader.listProviders();
    }

    canUseFeature(provider: string, feature: string, context?: Record<string, unknown>): boolean {
        return new ProviderCapabilitiesService(this.loader).can(provider, feature, context);
    }

    supportsBilling(method: string, args?: { config?: PortoConfig; wireId?: string }): boolean {
        const provider = Object.keys(args?.config?.providers ?? {})[0] ?? this.loader.providerId;
        const dataPath = args?.config?.data ?? null;
        return supportsBilling(provider, method, {
            config: args?.config,
            wireId: args?.wireId,
            dataPath,
        });
    }

    supportsExecution(method: string, args?: { config?: PortoConfig; wireId?: string }): boolean {
        const provider = Object.keys(args?.config?.providers ?? {})[0] ?? this.loader.providerId;
        const dataPath = args?.config?.data ?? null;
        return supportsExecution(provider, method, {
            config: args?.config,
            wireId: args?.wireId,
            dataPath,
        });
    }

    getBillingMethods(args?: {
        config?: PortoConfig;
        wireId?: string;
    }): string[] {
        const provider = Object.keys(args?.config?.providers ?? {})[0] ?? this.loader.providerId;
        const dataPath = args?.config?.data ?? null;
        const wire = args?.wireId ?? getDefaultWireId(provider, dataPath);
        if (!wire) {
            return [];
        }
        return listWireBillingMethods(provider, wire, dataPath);
    }

    getExecutionMethods(args?: {
        config?: PortoConfig;
        wireId?: string;
    }): string[] {
        const provider = Object.keys(args?.config?.providers ?? {})[0] ?? this.loader.providerId;
        const dataPath = args?.config?.data ?? null;
        const wire = args?.wireId ?? getDefaultWireId(provider, dataPath);
        if (!wire) {
            return [];
        }
        return listWireExecutionMethods(provider, wire, dataPath);
    }

    getZones(): Array<{ id: string; name: string; country_codes: string[] }> {
        return this.loader.getAllZones().map((z) => ({
            id: z.id,
            name: z.name,
            country_codes: z.country_codes,
        }));
    }

    getCapabilities(context?: Record<string, unknown>): Record<string, unknown> {
        void context;
        const services = this.loader.getAllServices();
        const features = this.loader.featuresLoader.getData();
        return {
            provider_id: this.loader.providerId,
            zones: this.getZones(),
            services,
            features,
            online_supported: true,
        };
    }

    toPublicDict(provider: PortoProvider): Record<string, unknown> {
        return {
            id: provider.id,
            name: provider.name,
            country: provider.country,
            mark_types: provider.mark_types,
        };
    }
}
