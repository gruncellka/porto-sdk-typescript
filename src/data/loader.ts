/**
 * Porto Data Loader - Loads and provides access to porto-data files
 *
 * Explicit mapping from porto-data JSON schemas to TypeScript types.
 * Loads the provider graph.json first to understand dependencies and relationships.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseLoader } from "./base-loader";
import { assertCatalogSchemaSupported } from "./catalog-schema";
import {
    DimensionsLoader,
    type EntityData,
    FeaturesLoader,
    PricesLoader,
    RestrictionsLoader,
    ServicesLoader,
} from "./entities";
import { type AddressForm, AddressesLoader } from "./entities/addresses";
import { EnvelopesLoader, type PortoEnvelope } from "./entities/envelopes";
import type { Feature } from "./entities/features";
import { JurisdictionsLoader } from "./entities/jurisdictions";
import { type EnvelopeLayout, LayoutsLoader } from "./entities/layouts";
import { MarketsLoader, type PortoMarket } from "./entities/markets";
import {
    type MarkAssetSize,
    type MarkCalibration,
    type MarkProfile,
    type MarkRect,
    MarksLoader,
} from "./entities/marks";
import { type PortoProduct, ProductsLoader } from "./entities/products";
import { type PortoProvider, ProvidersLoader } from "./entities/providers";
import { RulesLoader } from "./entities/rules";
import type { Service } from "./entities/services";
import { type PortoWeightTier, WeightTiersLoader } from "./entities/weight-tiers";
import { type PortoZone, ZonesLoader } from "./entities/zones";
import { FileTypeRegistry } from "./file-type-registry";
import { normalizeResolutionGraph } from "./graph-normalize";
import { ValidatedPortoDataLoader } from "./porto-data-loader";
import { ResolutionIndex } from "./resolution-index";

export type {
    PortoProduct,
    PortoZone,
    PortoWeightTier,
    PortoEnvelope,
    EnvelopeLayout,
    MarkProfile,
    PortoProvider,
    PortoMarket,
    Feature,
    Service,
};

export interface PortoPricing {
    product_id: string;
    zone: string;
    weight_tier: string;
    price: number;
    /** ISO 4217 from price row or file unit; null → provider graph default */
    currency?: string | null;
    effective_from: string | null;
    effective_to: string | null;
}

export interface ResolutionGraph {
    file_type: string;
    unit: {
        weight?: string;
        dimension?: string;
        price?: string;
        currency?: string;
        [key: string]: unknown;
    };
    dependencies: Record<
        string,
        {
            file: string;
            depends_on: string[];
            description?: string;
        }
    >;
    links: Record<
        string,
        {
            zones: string[];
            weight_tiers: string[];
        }
    >;
    mark_edges: Record<
        string,
        {
            profile?: string;
            services?: Record<string, string>;
        }
    >;
    wire_edges: Record<
        string,
        Record<
            string,
            Record<
                string,
                {
                    base?: number | string | null;
                    services?: Record<string, number | string>;
                }
            >
        >
    >;
    services: string[];
    strategy?: string | null;
    lookup_rules: Record<string, string>;
    global_settings: Record<string, unknown>;
}

export type PortoEntityType = string;

export interface PortoDataLoaderOptions {
    provider?: string;
    verifyChecksums?: boolean;
    strictMode?: boolean;
    embeddedFiles?: Record<string, Record<string, unknown>>;
}

import { normalizeProviderId } from "../config.js";

const DEFAULT_PROVIDER = "deutschepost";

export class PortoDataLoader {
    private readonly baseLoader: BaseLoader;
    private validatedFiles: Record<string, Record<string, unknown>> = {};

    readonly providerId: string;
    readonly dataPath: string;
    resolutionGraph!: ResolutionGraph;
    resolutionIndex?: ResolutionIndex;

    private fileTypeRegistry: FileTypeRegistry;

    /** @internal Entity loaders for envelope matching and metadata reads */
    readonly envelopesLoader: EnvelopesLoader;
    /** @internal */
    readonly layoutsLoader: LayoutsLoader;
    /** @internal */
    readonly addressesLoader: AddressesLoader;
    /** @internal */
    readonly marksLoader: MarksLoader;
    /** @internal */
    readonly featuresLoader: FeaturesLoader;

    private productsLoader: ProductsLoader;
    private zonesLoader: ZonesLoader;
    private weightTiersLoader: WeightTiersLoader;
    private pricesLoader: PricesLoader;
    private dimensionsLoader: DimensionsLoader;
    private servicesLoader: ServicesLoader;
    private restrictionsLoader: RestrictionsLoader;
    private providersLoader: ProvidersLoader;
    private marketsLoader: MarketsLoader;
    private jurisdictionsLoader: JurisdictionsLoader;
    private rulesLoader: RulesLoader;

    constructor(dataPath: string, options: PortoDataLoaderOptions = {}) {
        this.dataPath = dataPath;
        this.providerId = normalizeProviderId(options.provider ?? DEFAULT_PROVIDER);
        const verifyChecksums = options.verifyChecksums !== false;
        const strictMode = options.strictMode !== false;

        this.baseLoader = new BaseLoader(dataPath, verifyChecksums);
        const checksumMap = this.baseLoader.checksumMap;

        this.productsLoader = new ProductsLoader(dataPath, checksumMap);
        this.zonesLoader = new ZonesLoader(dataPath, checksumMap);
        this.weightTiersLoader = new WeightTiersLoader(dataPath, checksumMap);
        this.pricesLoader = new PricesLoader(dataPath, checksumMap);
        this.dimensionsLoader = new DimensionsLoader(dataPath, checksumMap);
        this.featuresLoader = new FeaturesLoader(dataPath, checksumMap);
        this.servicesLoader = new ServicesLoader(dataPath, checksumMap);
        this.restrictionsLoader = new RestrictionsLoader(dataPath, checksumMap);
        this.envelopesLoader = new EnvelopesLoader(dataPath, checksumMap);
        this.layoutsLoader = new LayoutsLoader(dataPath, checksumMap);
        this.addressesLoader = new AddressesLoader(dataPath, checksumMap);
        this.marksLoader = new MarksLoader(dataPath, checksumMap);
        this.providersLoader = new ProvidersLoader(dataPath, checksumMap);
        this.marketsLoader = new MarketsLoader(dataPath, checksumMap);
        this.jurisdictionsLoader = new JurisdictionsLoader(dataPath, checksumMap);
        this.rulesLoader = new RulesLoader(dataPath, checksumMap);

        this.fileTypeRegistry = new FileTypeRegistry({
            loadProducts: (data) => this.productsLoader.load(data),
            loadZones: (data) => this.zonesLoader.load(data),
            loadWeightTiers: (data) => this.weightTiersLoader.load(data),
            loadWeights: (data) =>
                this.weightTiersLoader.load({
                    ...data,
                    weight_tiers: data.weights ?? data.weight_tiers,
                    file_type: "weight_tiers",
                }),
            loadPrices: (data) => this.pricesLoader.load(data),
            loadProductPrices: (data) =>
                this.pricesLoader.load({
                    file_type: "prices",
                    unit: data.unit,
                    prices: { product_prices: (data.product_prices as unknown[]) ?? [] },
                }),
            loadServicePrices: (data) => this.pricesLoader.loadServicePrices(data),
            loadDimensions: (data) => this.dimensionsLoader.load(data),
            loadFeatures: (data) => this.featuresLoader.load(data),
            loadServices: (data) => this.servicesLoader.load(data),
            loadRestrictions: (data) => this.restrictionsLoader.load(data),
            loadEnvelopes: (data) => this.envelopesLoader.load(data),
            loadLayouts: (data) => this.layoutsLoader.load(data),
            loadAddresses: (data) => this.addressesLoader.load(data),
            loadMarks: (data) => this.marksLoader.load(data),
            loadProviders: (data) => this.providersLoader.load(data),
            loadMarkets: (data) => this.marketsLoader.load(data),
            loadJurisdictions: (data) => this.jurisdictionsLoader.load(data),
            loadRules: (data) => this.rulesLoader.load(data),
        });

        if (options.embeddedFiles && Object.keys(options.embeddedFiles).length > 0) {
            this.hydrateEmbeddedFiles(options.embeddedFiles);
            return;
        }

        if (strictMode) {
            const validatedLoader = new ValidatedPortoDataLoader(
                dataPath,
                verifyChecksums,
                this.providerId,
            );
            const validated = validatedLoader.load();
            this.validatedFiles = validated.files as Record<string, Record<string, unknown>>;
            this.baseLoader.setMetadata(validated.metadata as Record<string, unknown>);
            this.baseLoader.buildChecksumMap();
            this.resolutionGraph = validated.registries.resolutionGraph;
            this.loadAllDataInOrder();
            this.loadRegistryEntitiesFromValidated();
            this.buildResolutionIndex();
        } else {
            this.baseLoader.verifyChecksums = false;
            const metadata = this.baseLoader.loadMetadata();
            if (metadata) {
                assertCatalogSchemaSupported(metadata);
            }
            const graphPath = `providers/${this.providerId}/graph.json`;
            const graphData = this.baseLoader.loadData(graphPath);
            this.resolutionGraph = normalizeResolutionGraph(graphData);
            const relaxedFiles = [
                "policy/markets.json",
                "policy/jurisdictions.json",
                "formats/envelopes.json",
                "formats/layouts.json",
                "formats/addresses.json",
                "providers.json",
                `providers/${this.providerId}/products.json`,
                `providers/${this.providerId}/zones.json`,
                `providers/${this.providerId}/weights.json`,
                `providers/${this.providerId}/prices/products.json`,
                `providers/${this.providerId}/prices/services.json`,
                `providers/${this.providerId}/marks.json`,
                `providers/${this.providerId}/features.json`,
                `providers/${this.providerId}/services.json`,
            ];
            for (const relativePath of relaxedFiles) {
                const fileName = relativePath.split("/").pop()!;
                try {
                    const data = this.baseLoader.loadData(relativePath);
                    this.loadFileByName(fileName, data, relativePath);
                } catch {}
            }
            this.buildResolutionIndex();
        }
    }

    /** Load catalog payloads without filesystem access (browser bundle). */
    static fromEmbedded(
        embeddedFiles: Record<string, Record<string, unknown>>,
        options: Omit<PortoDataLoaderOptions, "embeddedFiles"> = {},
    ): PortoDataLoader {
        return new PortoDataLoader("", {
            ...options,
            embeddedFiles,
            strictMode: false,
            verifyChecksums: false,
        });
    }

    private hydrateEmbeddedFiles(embeddedFiles: Record<string, Record<string, unknown>>): void {
        const metadata = embeddedFiles["metadata.json"];
        if (metadata) {
            assertCatalogSchemaSupported(metadata);
            this.baseLoader.setMetadata(metadata);
        }
        const graphPayload =
            embeddedFiles[`providers/${this.providerId}/graph.json`] ??
            embeddedFiles["providers/deutschepost/graph.json"];
        this.resolutionGraph = normalizeResolutionGraph(
            (graphPayload ?? {}) as Record<string, unknown>,
        );
        for (const [relativePath, payload] of Object.entries(embeddedFiles)) {
            if (relativePath === "mappings.json" || relativePath.endsWith("/graph.json")) {
                continue;
            }
            const fileName = relativePath.split("/").pop()!;
            this.loadFileByName(fileName, payload, relativePath);
        }
        this.buildResolutionIndex();
    }

    private loadRegistryEntitiesFromValidated(): void {
        for (const relativePath of ["providers.json"]) {
            const payload = this.validatedFiles[relativePath];
            if (!payload) continue;
            const fileName = relativePath.split("/").pop()!;
            this.loadFileByName(fileName, payload, relativePath);
        }
    }

    private loadAllDataInOrder(): void {
        const loadOrder = this.baseLoader.calculateLoadOrder(this.resolutionGraph);
        for (const fileName of loadOrder) {
            if (fileName === "graph.json") {
                continue;
            }
            this.loadFileByName(fileName);
        }
    }

    private loadFileByName(
        filename: string,
        data?: Record<string, unknown>,
        sourcePath?: string,
    ): void {
        const resolvedPath = sourcePath ?? this.resolveGraphFilePath(filename);
        let payload = data;
        if (!payload) {
            if (filename in this.validatedFiles) {
                payload = this.validatedFiles[filename];
            } else if (resolvedPath in this.validatedFiles) {
                payload = this.validatedFiles[resolvedPath];
            } else {
                payload = this.baseLoader.loadData(resolvedPath);
            }
        }

        let fileType = payload.file_type as string | undefined;
        if (!fileType) {
            const inferred: Record<string, string> = {
                "providers.json": "providers",
                "envelopes.json": "envelopes",
                "layouts.json": "layouts",
                "addresses.json": "addresses",
            };
            fileType = inferred[filename.split("/").pop() ?? filename];
        }
        if (!fileType) {
            throw new Error(`File ${filename} missing 'file_type' field`);
        }

        const result = this.fileTypeRegistry.dispatch(fileType, payload);
        if (!result.handled) {
            throw new Error(`Unsupported porto-data file_type: ${fileType}`);
        }
    }

    private buildResolutionIndex(): void {
        this.resolutionIndex = ResolutionIndex.build(
            this.resolutionGraph.links,
            this.productsLoader.getAllProducts(),
        );
    }

    private resolveGraphFilePath(filename: string): string {
        if (
            filename.startsWith("policy/") ||
            filename.startsWith("formats/") ||
            filename.startsWith("providers/")
        ) {
            return filename;
        }
        const providerPath = `providers/${this.providerId}/${filename}`;
        if (providerPath in this.validatedFiles) {
            return providerPath;
        }
        if (existsSync(join(this.baseLoader.dataPath, providerPath))) {
            return providerPath;
        }
        return filename;
    }

    getProduct(productId: string): PortoProduct | undefined {
        return this.productsLoader.getProduct(productId);
    }

    getAllProducts(): PortoProduct[] {
        return this.productsLoader.getAllProducts();
    }

    getZoneByCountryCode(countryCode: string): PortoZone | undefined {
        return this.zonesLoader.getZoneByCountryCode(countryCode);
    }

    getZone(zoneId: string): PortoZone | undefined {
        return this.zonesLoader.getZone(zoneId);
    }

    getAllZones(): PortoZone[] {
        return this.zonesLoader.getAllZones();
    }

    getWeightTier(tierId: string): PortoWeightTier | undefined {
        return this.weightTiersLoader.getWeightTier(tierId);
    }

    getAllWeightTiers(): PortoWeightTier[] {
        return [...this.weightTiersLoader.getData()];
    }

    getPriceByProductZoneWeightTier(
        productId: string,
        zoneId: string,
        weightTierId: string,
    ): PortoPricing | null {
        return this.pricesLoader.getPricing(productId, zoneId, weightTierId);
    }

    getServicePrice(serviceId: string, zoneId?: string | null): number | null {
        return this.pricesLoader.getServicePrice(serviceId, zoneId);
    }

    providerJurisdictionTokens(providerId?: string): Set<string> {
        const pid = (providerId ?? this.providerId ?? "").trim().toLowerCase();
        const provider = this.getProvider(pid);
        if (!provider) return new Set();
        const country = (provider.country || "").trim().toUpperCase();
        if (this.jurisdictionsLoader.euMembers().has(country)) return new Set(["EU"]);
        if (country === "CH") return new Set(["CH"]);
        if (country === "UA") return new Set(["UA"]);
        return new Set();
    }

    classifyRestrictions(
        countryCode: string,
        regionCode?: string | null,
        options?: { jurisdictions?: Iterable<string> | null; asOf?: Date },
    ): {
        legal: Record<string, EntityData>;
        routing: Record<string, EntityData>;
    } {
        const tokens = options?.jurisdictions ?? this.providerJurisdictionTokens();
        return this.restrictionsLoader.classifyRestrictions(countryCode, regionCode, {
            jurisdictions: tokens,
            asOf: options?.asOf,
        });
    }

    restrictionsCatalog(): {
        legal: Record<string, EntityData>;
        routing: Record<string, EntityData>;
    } {
        return this.restrictionsLoader.getData();
    }

    getFeaturesForProduct(productId: string): Feature[] {
        return this.featuresLoader.getFeaturesForProduct(productId);
    }

    getFeaturesForZone(zoneId: string): Feature[] {
        return this.featuresLoader.getFeaturesForZone(zoneId);
    }

    getDimensionsForProduct(productId: string): unknown[] {
        const product = this.getProduct(productId);
        if (!product) return [];
        return this.dimensionsLoader.getDimensionsForProduct(productId, product.envelope_ids);
    }

    getDimensionById(dimensionId: string): unknown | null {
        return this.dimensionsLoader.getDimension(dimensionId);
    }

    getAllDimensions(): unknown[] {
        return this.dimensionsLoader.getAllDimensions();
    }

    getServicesForProduct(productId: string): Service[] {
        return this.servicesLoader.getServicesForProduct(productId);
    }

    getServicesForZone(zoneId: string): Service[] {
        return this.servicesLoader.getServicesForZone(zoneId);
    }

    getAllServices(): Service[] {
        return this.servicesLoader.getAllServices();
    }

    getService(serviceId: string): Service | null {
        return this.servicesLoader.getService(serviceId);
    }

    getAllFeatures(): Feature[] {
        return this.featuresLoader.getAllFeatures();
    }

    getFeature(featureId: string): Feature | null {
        return this.featuresLoader.getFeature(featureId);
    }

    getEnvelope(envelopeId: string): PortoEnvelope | undefined {
        return this.envelopesLoader.getEnvelope(envelopeId);
    }

    listEnvelopes(): PortoEnvelope[] {
        return this.envelopesLoader.listEnvelopes();
    }

    getLayout(jurisdiction: string, envelopeId: string): EnvelopeLayout | undefined {
        return this.layoutsLoader.getLayout(jurisdiction, envelopeId);
    }

    getAddressForm(jurisdiction: string): AddressForm | undefined {
        return this.addressesLoader.getForm(jurisdiction);
    }

    getMarkProfile(profileId: string): MarkProfile | undefined {
        return this.marksLoader.getProfile(profileId);
    }

    getDefaultMarkProfile(): MarkProfile | undefined {
        return this.marksLoader.getDefaultProfile();
    }

    getMarkPlacement(envelopeId: string): MarkRect | undefined {
        return this.marksLoader.getPlacement(envelopeId);
    }

    getMarkCalibration(input: {
        wire: string;
        mark_profile: string;
        mime_type?: string;
        dpi?: number;
    }): MarkCalibration | undefined {
        return this.marksLoader.getCalibration(input);
    }

    getMarkCalibrationAssetSize(input: {
        wire: string;
        mark_profile: string;
        mark_profile_id?: string | null;
        mime_type?: string;
        dpi?: number;
    }): MarkAssetSize | undefined {
        return this.marksLoader.getCalibrationAssetSize(input);
    }

    listProviders(): PortoProvider[] {
        return this.providersLoader.listProviders();
    }

    getProvider(providerId: string): PortoProvider | undefined {
        return this.providersLoader.getProvider(providerId);
    }

    getMarket(countryCode: string): PortoMarket | undefined {
        return this.marketsLoader.getMarket(countryCode);
    }

    getTimezoneForCountry(countryCode: string): string | undefined {
        return this.jurisdictionsLoader.getTimezoneForCountry(countryCode);
    }

    getTimezoneByCountry(): Record<string, string> {
        return this.jurisdictionsLoader.getTimezoneByCountry();
    }

    countryCodes(): string[] {
        return this.jurisdictionsLoader.countryCodes();
    }

    getCountryCode3(countryCode: string): string | undefined {
        return this.jurisdictionsLoader.getCountryCode3(countryCode);
    }
}
