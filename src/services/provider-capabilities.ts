/**
 * Provider Capabilities Service - Policy Layer
 *
 * A service enables a feature iff services[].features[] resolves to that
 * Feature.kind. Unknown / missing → false (fail-closed).
 * Public can() takes FeatureKind only.
 * Orderability is graph.edges.wire, not a service boolean.
 */

import type { PortoDataLoader } from "../data/loader.js";
import { type FeatureKind, isFeatureKind, parseFeatureKind } from "../kinds.js";

export interface CapabilityContext {
    zone?: string;
    countryCode?: string;
    wire?: string;
}

export class ProviderCapabilitiesService {
    constructor(private readonly loader: PortoDataLoader) {}

    canUseFeature(
        provider: string,
        feature: FeatureKind | string,
        context: CapabilityContext = {},
    ): boolean {
        void provider;
        if (!isFeatureKind(feature)) return false;
        const featKind = parseFeatureKind(feature);
        const zone = context.zone?.trim().toLowerCase();

        const servicesWithFeature = this.loader
            .getAllServices()
            .filter((svc) =>
                svc.features.some((fid) => this.loader.getFeature(String(fid))?.kind === featKind),
            );

        if (servicesWithFeature.length === 0) {
            return false;
        }

        for (const svc of servicesWithFeature) {
            const supportedZones = svc.supported_zones ?? [];
            if (supportedZones.length > 0 && zone && !supportedZones.includes(zone)) {
                continue;
            }
            return true;
        }

        return false;
    }

    can(
        provider: string,
        feature: FeatureKind | string,
        context: CapabilityContext | Record<string, unknown> = {},
    ): boolean {
        return this.canUseFeature(provider, feature, context as CapabilityContext);
    }
}
