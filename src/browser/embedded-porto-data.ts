/**
 * Browser catalog transport for PortoClient — SDK-owned reads of @gruncellka/porto-data.
 * Apps call PortoClient only; they must not import porto-data JSON.
 *
 * Each client receives **one** provider slice (+ shared files). Hydrating all
 * providers in one map merges product loaders; the SDK then falls back to the
 * deutschepost graph when a provider path is missing.
 */

import envelopes from "@gruncellka/porto-data/porto_data/formats/envelopes.json";
import layouts from "@gruncellka/porto-data/porto_data/formats/layouts.json";
import mappings from "@gruncellka/porto-data/porto_data/mappings.json";
import jurisdictions from "@gruncellka/porto-data/porto_data/policy/jurisdictions.json";
import markets from "@gruncellka/porto-data/porto_data/policy/markets.json";
import restrictions from "@gruncellka/porto-data/porto_data/policy/restrictions.json";
import providers from "@gruncellka/porto-data/porto_data/providers.json";

import dpFeatures from "@gruncellka/porto-data/porto_data/providers/deutschepost/features.json";
import dpGraph from "@gruncellka/porto-data/porto_data/providers/deutschepost/graph.json";
import dpMarks from "@gruncellka/porto-data/porto_data/providers/deutschepost/marks.json";
import dpPrices from "@gruncellka/porto-data/porto_data/providers/deutschepost/prices/products.json";
import dpPriceServices from "@gruncellka/porto-data/porto_data/providers/deutschepost/prices/services.json";
import dpProducts from "@gruncellka/porto-data/porto_data/providers/deutschepost/products.json";
import dpServices from "@gruncellka/porto-data/porto_data/providers/deutschepost/services.json";
import dpWeights from "@gruncellka/porto-data/porto_data/providers/deutschepost/weights.json";
import dpZones from "@gruncellka/porto-data/porto_data/providers/deutschepost/zones.json";

import lpFeatures from "@gruncellka/porto-data/porto_data/providers/laposte/features.json";
import lpGraph from "@gruncellka/porto-data/porto_data/providers/laposte/graph.json";
import lpMarks from "@gruncellka/porto-data/porto_data/providers/laposte/marks.json";
import lpPrices from "@gruncellka/porto-data/porto_data/providers/laposte/prices/products.json";
import lpPriceServices from "@gruncellka/porto-data/porto_data/providers/laposte/prices/services.json";
import lpProducts from "@gruncellka/porto-data/porto_data/providers/laposte/products.json";
import lpServices from "@gruncellka/porto-data/porto_data/providers/laposte/services.json";
import lpWeights from "@gruncellka/porto-data/porto_data/providers/laposte/weights.json";
import lpZones from "@gruncellka/porto-data/porto_data/providers/laposte/zones.json";

import spFeatures from "@gruncellka/porto-data/porto_data/providers/swisspost/features.json";
import spGraph from "@gruncellka/porto-data/porto_data/providers/swisspost/graph.json";
import spMarks from "@gruncellka/porto-data/porto_data/providers/swisspost/marks.json";
import spPrices from "@gruncellka/porto-data/porto_data/providers/swisspost/prices/products.json";
import spPriceServices from "@gruncellka/porto-data/porto_data/providers/swisspost/prices/services.json";
import spProducts from "@gruncellka/porto-data/porto_data/providers/swisspost/products.json";
import spRules from "@gruncellka/porto-data/porto_data/providers/swisspost/rules.json";
import spServices from "@gruncellka/porto-data/porto_data/providers/swisspost/services.json";
import spWeights from "@gruncellka/porto-data/porto_data/providers/swisspost/weights.json";
import spZones from "@gruncellka/porto-data/porto_data/providers/swisspost/zones.json";

import uaFeatures from "@gruncellka/porto-data/porto_data/providers/ukrposhta/features.json";
import uaGraph from "@gruncellka/porto-data/porto_data/providers/ukrposhta/graph.json";
import uaMarks from "@gruncellka/porto-data/porto_data/providers/ukrposhta/marks.json";
import uaPrices from "@gruncellka/porto-data/porto_data/providers/ukrposhta/prices/products.json";
import uaPriceServices from "@gruncellka/porto-data/porto_data/providers/ukrposhta/prices/services.json";
import uaProducts from "@gruncellka/porto-data/porto_data/providers/ukrposhta/products.json";
import uaServices from "@gruncellka/porto-data/porto_data/providers/ukrposhta/services.json";
import uaWeights from "@gruncellka/porto-data/porto_data/providers/ukrposhta/weights.json";
import uaZones from "@gruncellka/porto-data/porto_data/providers/ukrposhta/zones.json";

const SHARED_EMBEDDED_FILES: Record<string, Record<string, unknown>> = {
    "mappings.json": mappings as Record<string, unknown>,
    "providers.json": providers as Record<string, unknown>,
    "policy/markets.json": markets as Record<string, unknown>,
    "policy/jurisdictions.json": jurisdictions as Record<string, unknown>,
    "policy/restrictions.json": restrictions as Record<string, unknown>,
    "formats/envelopes.json": envelopes as Record<string, unknown>,
    "formats/layouts.json": layouts as Record<string, unknown>,
};

type ProviderSlice = Record<string, Record<string, unknown>>;

const PROVIDER_SLICES: Record<string, ProviderSlice> = {
    deutschepost: {
        "providers/deutschepost/graph.json": dpGraph as Record<string, unknown>,
        "providers/deutschepost/products.json": dpProducts as Record<string, unknown>,
        "providers/deutschepost/zones.json": dpZones as Record<string, unknown>,
        "providers/deutschepost/weights.json": dpWeights as Record<string, unknown>,
        "providers/deutschepost/prices/products.json": dpPrices as Record<string, unknown>,
        "providers/deutschepost/prices/services.json": dpPriceServices as Record<string, unknown>,
        "providers/deutschepost/marks.json": dpMarks as Record<string, unknown>,
        "providers/deutschepost/features.json": dpFeatures as Record<string, unknown>,
        "providers/deutschepost/services.json": dpServices as Record<string, unknown>,
    },
    laposte: {
        "providers/laposte/graph.json": lpGraph as Record<string, unknown>,
        "providers/laposte/products.json": lpProducts as Record<string, unknown>,
        "providers/laposte/zones.json": lpZones as Record<string, unknown>,
        "providers/laposte/weights.json": lpWeights as Record<string, unknown>,
        "providers/laposte/prices/products.json": lpPrices as Record<string, unknown>,
        "providers/laposte/prices/services.json": lpPriceServices as Record<string, unknown>,
        "providers/laposte/marks.json": lpMarks as Record<string, unknown>,
        "providers/laposte/features.json": lpFeatures as Record<string, unknown>,
        "providers/laposte/services.json": lpServices as Record<string, unknown>,
    },
    swisspost: {
        "providers/swisspost/graph.json": spGraph as Record<string, unknown>,
        "providers/swisspost/products.json": spProducts as Record<string, unknown>,
        "providers/swisspost/zones.json": spZones as Record<string, unknown>,
        "providers/swisspost/weights.json": spWeights as Record<string, unknown>,
        "providers/swisspost/prices/products.json": spPrices as Record<string, unknown>,
        "providers/swisspost/prices/services.json": spPriceServices as Record<string, unknown>,
        "providers/swisspost/marks.json": spMarks as Record<string, unknown>,
        "providers/swisspost/features.json": spFeatures as Record<string, unknown>,
        "providers/swisspost/services.json": spServices as Record<string, unknown>,
        "providers/swisspost/rules.json": spRules as Record<string, unknown>,
    },
    ukrposhta: {
        "providers/ukrposhta/graph.json": uaGraph as Record<string, unknown>,
        "providers/ukrposhta/products.json": uaProducts as Record<string, unknown>,
        "providers/ukrposhta/zones.json": uaZones as Record<string, unknown>,
        "providers/ukrposhta/weights.json": uaWeights as Record<string, unknown>,
        "providers/ukrposhta/prices/products.json": uaPrices as Record<string, unknown>,
        "providers/ukrposhta/prices/services.json": uaPriceServices as Record<string, unknown>,
        "providers/ukrposhta/marks.json": uaMarks as Record<string, unknown>,
        "providers/ukrposhta/features.json": uaFeatures as Record<string, unknown>,
        "providers/ukrposhta/services.json": uaServices as Record<string, unknown>,
    },
};

const DEFAULT_PROVIDER = "deutschepost";

/** Shared + one provider slice for {@link PortoClient} `embeddedFiles`. */
export function embeddedPortoDataFilesFor(
    providerId: string,
): Record<string, Record<string, unknown>> {
    const key = providerId.trim().toLowerCase();
    const slice = PROVIDER_SLICES[key] ?? PROVIDER_SLICES[DEFAULT_PROVIDER];
    return {
        ...SHARED_EMBEDDED_FILES,
        ...slice,
    };
}
