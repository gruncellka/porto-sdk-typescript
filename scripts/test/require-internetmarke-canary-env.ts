/** Fail closed unless paid Internetmarke canary env is complete. */

import { loadInternetmarkeConfig } from "../../src/adapters/deutschepost/internetmarke/bootstrap.js";

if (process.env.I_ACCEPT_PAID_API_COST !== "1") {
    console.error("adapter-canary: I_ACCEPT_PAID_API_COST=1 is required");
    process.exit(1);
}

const im = loadInternetmarkeConfig("deutschepost", process.env);
if (!im) {
    console.error(
        "adapter-canary: missing Internetmarke/DHL API credentials " +
            "(PORTO_DEUTSCHEPOST_INTERNETMARKE_API_KEY/SECRET or DHL_API_KEY/SECRET)",
    );
    process.exit(1);
}

const creds = im.credentials ?? {};
if (!creds.username || !creds.password) {
    console.error(
        "adapter-canary: missing Portokasse username/password " +
            "(PORTO_DEUTSCHEPOST_INTERNETMARKE_USERNAME/PASSWORD)",
    );
    process.exit(1);
}

console.log("adapter-canary: Internetmarke env OK");
