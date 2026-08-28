/**
 * Postal Resolution Context - Unified runtime object for multi-provider resolution
 *
 * Holds loader (with global + provider data) and provider_id. The resolver uses
 * this context exclusively - no provider branching, all differences come from data.
 */

import type { PortoDataLoader } from "./loader.js";

export interface PostalResolutionContext {
    loader: PortoDataLoader;
    providerId: string;
}
