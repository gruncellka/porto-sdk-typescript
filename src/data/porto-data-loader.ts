import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ConfigurationError, PortoErrorCode } from "../errors";
import { assertCatalogSchemaSupported } from "./catalog-schema";
import { normalizeResolutionGraph } from "./graph-normalize";
import type { PortoPricing, PortoProduct, PortoWeightTier, PortoZone } from "./loader";
import { PortoDataValidator } from "./porto-data-validator";
import type { PortoDataRegistries, PortoServicePrice } from "./registries";

const DEFAULT_PROVIDER = "deutschepost";

function restrictionRows(document: Record<string, unknown> | undefined): unknown[] {
    if (!document) return [];
    const rows: unknown[] = [];
    for (const name of ["legal", "routing", "operational"] as const) {
        const block = document[name];
        if (block && typeof block === "object" && !Array.isArray(block)) {
            for (const [country, payload] of Object.entries(block as Record<string, unknown>)) {
                if (payload && typeof payload === "object") {
                    rows.push({ collection: name, country_code: country, ...(payload as object) });
                }
            }
        }
    }
    return rows;
}

export class ValidatedPortoDataLoader {
    constructor(
        private readonly dataPath: string,
        private readonly verifyChecksums: boolean,
        private readonly provider: string = DEFAULT_PROVIDER,
    ) {}

    load(): {
        metadata: unknown;
        mappings: unknown;
        files: Record<string, unknown>;
        registries: PortoDataRegistries;
        servicePrices: unknown[];
    } {
        const metadata = this.loadJson("metadata.json");
        assertCatalogSchemaSupported(metadata);
        const mappings = this.loadJson("mappings.json");
        const validator = new PortoDataValidator({
            dataPath: this.dataPath,
            metadata,
            mappings,
            verifyChecksums: this.verifyChecksums,
            provider: this.provider,
        });
        validator.validatePaths();

        const files: Record<string, unknown> = {};
        for (const [schemaPath, dataPath] of validator.getMappingPairs()) {
            const fileName = dataPath.split("/").pop();
            if (!fileName) continue;
            const data = validator.validateMappedFile(dataPath, schemaPath);
            files[dataPath] = data;
            if (!(fileName in files)) {
                files[fileName] = data;
            }
        }

        if (!files["graph.json"]) {
            throw new ConfigurationError(
                "graph.json not found in loaded files. Check porto-data mappings and that graph.json exists for the provider.",
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                500,
            );
        }

        const registries = this.buildRegistries(files);
        validator.validateCrossFileConsistency(registries);

        return {
            metadata,
            mappings,
            files,
            registries,
            servicePrices: registries.servicePrices,
        };
    }

    private buildRegistries(files: Record<string, any>): PortoDataRegistries {
        const providerPrefix = `providers/${this.provider}/`;
        const fileAt = (relativePath: string, fallbackName?: string): any =>
            files[`${providerPrefix}${relativePath}`] ??
            (fallbackName ? files[fallbackName] : undefined);

        const productsRaw = fileAt("products.json", "products.json")?.products ?? [];
        const zonesRaw = fileAt("zones.json", "zones.json")?.zones ?? [];
        const weightsRaw = fileAt("weights.json", "weight_tiers.json");
        const weightTiersRaw =
            weightsRaw?.weights ?? weightsRaw?.weight_tiers ?? fileAt("weights.json") ?? {};
        const pricesFile =
            fileAt("prices/products.json") ?? files["prices.json"]?.prices ?? files["prices.json"];
        const pricesRaw =
            pricesFile?.product_prices ?? files["prices.json"]?.prices?.product_prices ?? [];
        const pricesFileUnit = pricesFile?.unit as { currency?: string } | undefined;

        const products: PortoProduct[] = productsRaw.map((p: any) => {
            const envelopeIds = [...(p.envelope_ids || [])];
            const zones = [...(p.zones || [])];
            return {
                id: p.id,
                name: p.name,
                envelope_ids: envelopeIds,
                zones,
                weight_tier: p.weight_tier,
                effective_from: p.effective_from ?? null,
                effective_to: p.effective_to ?? null,
                provider_mappings: p.provider_mappings,
                mark_type: p.mark_type,
                tracking: p.tracking,
            };
        });

        const zones: PortoZone[] =
            typeof zonesRaw === "object" && !Array.isArray(zonesRaw)
                ? Object.entries(zonesRaw).map(([zoneId, zoneData]: [string, any]) => ({
                      id: zoneId,
                      name: zoneData.name || "",
                      description: zoneData.description || "",
                      country_codes: zoneData.country_codes || [],
                  }))
                : zonesRaw.map((z: any) => ({
                      id: z.id,
                      name: z.name || "",
                      description: z.description || "",
                      country_codes: z.country_codes || [],
                  }));

        const weightTiers: PortoWeightTier[] =
            typeof weightTiersRaw === "object" && !Array.isArray(weightTiersRaw)
                ? Object.entries(weightTiersRaw).map(([id, wt]: [string, any]) => ({
                      id,
                      min: wt.min || 0,
                      max_weight: wt.max || wt.max_weight || 0,
                  }))
                : (weightTiersRaw as any[]).map((wt: any) => ({
                      id: wt.id,
                      min: wt.min || 0,
                      max_weight: wt.max || wt.max_weight || 0,
                  }));

        const prices: PortoPricing[] = pricesRaw.map((p: any) => {
            const fileCurrency =
                typeof pricesFileUnit?.currency === "string" && pricesFileUnit.currency.trim()
                    ? String(pricesFileUnit.currency).trim().toUpperCase()
                    : null;
            const rowCurrency =
                typeof p.currency === "string" && p.currency.trim()
                    ? String(p.currency).trim().toUpperCase()
                    : null;
            return {
                product_id: p.product_id,
                zone: p.zone,
                weight_tier: p.weight_tier,
                price: p.price?.[0]?.amount ?? 0,
                currency: rowCurrency ?? fileCurrency,
                effective_from: p.price?.[0]?.effective_from ?? null,
                effective_to: p.price?.[0]?.effective_to ?? null,
            };
        });

        const resolutionGraphRaw = fileAt("graph.json", "graph.json") ?? files["graph.json"] ?? {};

        return {
            dimensions: files["dimensions.json"]?.dimensions ?? [],
            products,
            prices,
            zones,
            weightTiers,
            services: fileAt("services.json", "services.json")?.services ?? [],
            features: fileAt("features.json", "features.json")?.features ?? [],
            restrictions: restrictionRows(
                (files["policy/restrictions.json"] as Record<string, unknown> | undefined) ??
                    (files["restrictions.json"] as Record<string, unknown> | undefined),
            ),
            resolutionGraph: normalizeResolutionGraph(
                resolutionGraphRaw as Record<string, unknown>,
            ),
            servicePrices: this.extractServicePrices(files),
        };
    }

    private extractServicePrices(files: Record<string, unknown>): PortoServicePrice[] {
        const providerPrefix = `providers/${this.provider}/`;
        const prices =
            (files[`${providerPrefix}prices/services.json`] as Record<string, unknown>) ??
            (files["prices.json"] as Record<string, unknown> | undefined);
        const arr =
            (prices as { service_prices?: unknown[] })?.service_prices ??
            ((prices?.prices as Record<string, unknown> | undefined)?.service_prices as
                | unknown[]
                | undefined);
        return Array.isArray(arr) ? (arr as PortoServicePrice[]) : [];
    }

    private loadJson(relativePath: string): unknown {
        const absolutePath = join(this.dataPath, relativePath);
        try {
            return JSON.parse(readFileSync(absolutePath, "utf-8"));
        } catch {
            throw new ConfigurationError(
                `Failed to load required porto-data file '${relativePath}'.`,
                PortoErrorCode.PORTO_DATA_NOT_FOUND,
                500,
            );
        }
    }
}
