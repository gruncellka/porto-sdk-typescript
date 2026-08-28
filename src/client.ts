/**
 * Porto Client - Main SDK entry point
 * Provider-agnostic: delegates to adapters via resolver.
 */

import { type AddressAdapter, getAddressAdapter } from "./adapters/resolver.js";
import type { NormalizedPortoConfig, PortoConfig, WireConfig } from "./config.js";
import { normalizePortoConfig, normalizeProviderId, runtimeFor, wiresFor } from "./config.js";
import type { PostalResolutionContext } from "./data/context.js";
import type { PortoDataLoader } from "./data/loader.js";
import {
    PortoDataRegistry,
    getValidProvidersFromEmbedded,
    getValidProvidersFromMappings,
} from "./data/porto-data-registry.js";
import { DomainIds } from "./data/validator.js";
import { PortoError, PortoErrorCode } from "./errors.js";
import { ProviderClient } from "./provider-client.js";
import { AddressResolver } from "./services/address.js";
import { EnvelopeResolverService, type Envelopes } from "./services/envelope-resolver.js";
import { JurisdictionsService } from "./services/jurisdictions.js";
import { PortoResolver } from "./services/porto-resolver.js";
import { ProvidersService } from "./services/providers.js";
import { RestrictionsService } from "./services/restrictions/index.js";
import { LetterValidationService } from "./services/validation.js";
import { HttpClient, type Transport } from "./transport/http-client.js";

export class PortoClient {
    readonly envelopes: Envelopes;
    readonly restrictions: RestrictionsService;
    readonly address: AddressResolver;
    readonly providers: ProvidersService;
    readonly jurisdictions: JurisdictionsService;

    config: PortoConfig;
    /** @internal */
    _normalized: NormalizedPortoConfig;
    private httpClient: Transport;

    /** @internal HTTP transport for bound adapters. */
    _sharedHttp(): Transport {
        return this.httpClient;
    }
    private addressAdapter!: AddressAdapter;
    readonly #dataLoader: PortoDataLoader;
    readonly #registry: PortoDataRegistry;
    readonly #providerClients = new Map<string, ProviderClient>();
    readonly #resolvers = new Map<string, PortoResolver>();

    /**
     * Main SDK client — postal platform entry point.
     *
     * Exemplar: envelopes.identify, restrictions.check, address.validate, providers.list,
     * provider(id).wallet / track.
     */

    constructor(config: PortoConfig = {}, options?: { transport?: Transport }) {
        this.config = config;
        this._normalized = normalizePortoConfig(config);
        const policy = this._normalized.transport;
        this.httpClient = options?.transport ?? new HttpClient(policy.timeout, policy.retries);

        const registry = new PortoDataRegistry(config);
        this.#registry = registry;
        const dataLoader = registry.loader;
        this.#dataLoader = dataLoader;
        const validator = new DomainIds(dataLoader);

        const portoResolver = this.#resolverFor(dataLoader.providerId, dataLoader);

        const providerId = dataLoader.providerId;
        this.addressAdapter = getAddressAdapter(
            providerId,
            wiresFor(this.config, providerId),
            this.httpClient,
        );

        this.address = new AddressResolver(dataLoader, validator);
        const validation = new LetterValidationService(portoResolver, validator, this.address);
        this.envelopes = new EnvelopeResolverService(validation, dataLoader);
        this.restrictions = new RestrictionsService(dataLoader);
        this.providers = new ProvidersService(dataLoader);
        this.jurisdictions = new JurisdictionsService(dataLoader);
    }

    /** Shared PortoResolver per provider id. */
    #resolverFor(providerId: string, dataLoader: PortoDataLoader): PortoResolver {
        const pid = normalizeProviderId(providerId);
        const existing = this.#resolvers.get(pid);
        if (existing) return existing;
        const validator = new DomainIds(dataLoader);
        const resolutionContext: PostalResolutionContext = {
            loader: dataLoader,
            providerId: pid,
        };
        const resolver = new PortoResolver(resolutionContext, validator, this._normalized.cache);
        this.#resolvers.set(pid, resolver);
        return resolver;
    }

    private catalogProviderId(): string {
        return this._normalized.defaultProvider;
    }

    private bound(): ProviderClient {
        return this.provider(this.catalogProviderId());
    }

    provider(providerId: string): ProviderClient {
        const pid = normalizeProviderId(providerId);
        const embedded = this.config.embeddedFiles;
        const catalog =
            embedded && Object.keys(embedded).length > 0
                ? getValidProvidersFromEmbedded(embedded)
                : getValidProvidersFromMappings(this.#registry.dataPath);
        const allowlist = this._normalized.allowlist;
        if (catalog.size > 0 && !catalog.has(pid)) {
            throw new PortoError(
                `Provider '${pid}' is unknown in the catalog or excluded by the providers allowlist.`,
                PortoErrorCode.PORTO_PROVIDER_NOT_CONFIGURED,
                400,
                {
                    provider_id: pid,
                    configured_providers: [...catalog].sort(),
                },
                false,
                pid,
            );
        }
        if (allowlist !== null && !allowlist.has(pid)) {
            throw new PortoError(
                `Provider '${pid}' is unknown in the catalog or excluded by the providers allowlist.`,
                PortoErrorCode.PORTO_PROVIDER_NOT_CONFIGURED,
                400,
                {
                    provider_id: pid,
                    configured_providers: [...allowlist].sort(),
                },
                false,
                pid,
            );
        }
        let bound = this.#providerClients.get(pid);
        if (!bound) {
            const runtime = runtimeFor(this.config, pid);
            const loader = this.#registry.loaderFor(pid);
            const dataPath = this._normalized.data ?? loader.dataPath;
            bound = new ProviderClient({
                root: this,
                providerId: pid,
                runtime,
                dataLoader: loader,
                dataPath,
                resolver: this.#resolverFor(pid, loader),
            });
            this.#providerClients.set(pid, bound);
        }
        return bound;
    }

    private _refreshAdapters(wires?: Record<string, WireConfig>): void {
        const providerId = this.#dataLoader.providerId;
        this.addressAdapter = getAddressAdapter(providerId, wires, this.httpClient);
    }

    updateCredentials(wires?: Record<string, WireConfig>): void {
        const pid = this.catalogProviderId();
        this.config = {
            ...this.config,
            providers: {
                ...this.config.providers,
                [pid]: { wires },
            },
        };
        this._normalized = normalizePortoConfig(this.config);
        this.#providerClients.clear();
        this._refreshAdapters(wires);
    }

    clearCache(): void {
        for (const resolver of this.#resolvers.values()) {
            resolver.clearCache();
        }
    }
}
