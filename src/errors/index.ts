/**
 * Unified error handling for Porto SDK — public barrel.
 */

export { PortoErrorCode, PORTO_ERROR_CODES } from "./codes.js";
export type { ProviderId, WireId } from "./models.js";
export {
    PortoError,
    ValidationError,
    AuthenticationError,
    TransportError,
    ProviderError,
    ConfigurationError,
    DataError,
    mapProviderError,
    redactSensitiveFields,
} from "./exceptions.js";
