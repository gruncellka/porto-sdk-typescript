/** Test-only helper — not a public PortoClient shim. */

import type { PortoClient } from "../../src/client.js";
import type { ProviderClient } from "../../src/provider-client.js";

export function boundProvider(client: PortoClient, providerId = "deutschepost"): ProviderClient {
    return client.provider(providerId);
}
