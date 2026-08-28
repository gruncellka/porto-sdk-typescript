import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "expect";
import {
    InternetmarkeAuthEndpoint,
    internetmarkeAuthErrorDetails,
    mapInternetmarkeAuthHttpError,
} from "../../../src/adapters/deutschepost/internetmarke/auth-errors.js";
import { InternetmarkeAuthImpl } from "../../../src/adapters/deutschepost/internetmarke/auth.js";
import {
    getInternetmarkeBaseUrl,
    loadInternetmarkeConfig,
} from "../../../src/adapters/deutschepost/internetmarke/bootstrap.js";
import {
    extractInternetmarkeVendorErrorCode,
    mapInternetmarkeErrorCode,
} from "../../../src/adapters/deutschepost/internetmarke/utils.js";
import { PortoClient } from "../../../src/client.js";
import { PortoError, PortoErrorCode, mapProviderError } from "../../../src/errors.js";
import { RECIPIENT as REQUIRE_RECIPIENT, SENDER as REQUIRE_SENDER } from "../../../src/requires.js";
import type { Address } from "../../../src/types/index.js";
import { lickoSender } from "../../support/addresses.js";
import { boundProvider } from "../../support/bound-provider.js";
import { resolvePortoDataPathForTests } from "../../support/porto-data-path.js";
import { bddContext as context } from "./bdd-context.js";

const SENDER: Address = lickoSender();

const MARK_EXECUTION_TRIGGERS: Record<string, { status: number; body: Record<string, unknown> }> = {
    wallet_balance_not_enough: {
        status: 400,
        body: {
            statusCode: "400",
            title: "walletBalanceNotEnough",
            description: "TEST-WALLET-ID",
            instance: "PCF-A1032",
        },
    },
};

const AUTH_TRIGGERS: Record<
    string,
    { status: number; body: string; endpoint: InternetmarkeAuthEndpoint; appTokenObtained: boolean }
> = {
    unauthorized_prose: {
        status: 401,
        body: "Unauthorized",
        endpoint: InternetmarkeAuthEndpoint.COMBINED_USER,
        appTokenObtained: false,
    },
    dhl_app_token_denied: {
        status: 401,
        body: '{"status":401,"detail":"Unauthorized for given resource."}',
        endpoint: InternetmarkeAuthEndpoint.DHL_APP_TOKEN,
        appTokenObtained: false,
    },
    invalid_portokasse_password: {
        status: 401,
        body: "Invalid password for Portokasse user",
        endpoint: InternetmarkeAuthEndpoint.COMBINED_USER,
        appTokenObtained: false,
    },
    portokasse_linkage_pending: {
        status: 401,
        body: '{"status":401,"title":"Unauthorized","detail":"Unauthorized"}',
        endpoint: InternetmarkeAuthEndpoint.PORTOKASSE_USER,
        appTokenObtained: true,
    },
};

function captureError(error: unknown): { code: string; message: string } {
    return {
        code: (error as { code?: string })?.code ?? PortoErrorCode.PORTO_MARK_FAILED,
        message: error instanceof Error ? error.message : String(error),
    };
}

function clientWithWires(overrides?: { dhlApiKey?: string; password?: string }):
    | PortoClient
    | undefined {
    const im = loadInternetmarkeConfig("deutschepost", process.env);
    if (!im) return undefined;
    const creds = { ...(im.credentials ?? {}) };
    if (!creds.username || !creds.password || !creds.dhl_api_key || !creds.dhl_api_secret) {
        return undefined;
    }
    if (overrides?.dhlApiKey) creds.dhl_api_key = overrides.dhlApiKey;
    if (overrides?.password) creds.password = overrides.password;
    return new PortoClient({
        data: resolvePortoDataPathForTests(),
        providers: {
            deutschepost: {
                wires: { internetmarke: { baseUrl: im.baseUrl, credentials: creds } },
            },
        },
    });
}

Given("Internetmarke credentials are not configured", () => {
    /* Keep the default test client (no live Internetmarke wires). */
});

Given("Internetmarke credentials are configured", function () {
    const configured = clientWithWires();
    if (!configured) return "skipped";
    context.client = configured;
    return undefined;
});

Given("Internetmarke DHL app credentials are invalid for testing", function () {
    const configured = clientWithWires({ dhlApiKey: "invalid-dhl-app-key-for-bdd" });
    if (!configured) return "skipped";
    context.client = configured;
    return undefined;
});

Given("Internetmarke Portokasse password is invalid for testing", function () {
    const configured = clientWithWires({ password: "definitely-wrong-password-for-bdd" });
    if (!configured) return "skipped";
    context.client = configured;
    return undefined;
});

Given("Internetmarke auth test trigger is {string}", (trigger: string) => {
    context.authTriggerDetail = trigger.trim();
});

Given("Internetmarke mark-execution test trigger is {string}", (trigger: string) => {
    context.markExecutionTriggerDetail = trigger.trim();
});

Given("the mark destination address is invalid for testing", () => {
    context.invalidMarkDestination = true;
});

When("I attempt to create a mark", async () => {
    const client = context.client!;
    try {
        let porto = context.resolvedPorto;
        if (!porto) {
            const resolved = await boundProvider(client).resolve({
                countryCode: "DE",
                weight: context.weight ?? 20,
            });
            porto = resolved;
            if (context.invalidMarkDestination) {
                porto = { ...porto, requires: [REQUIRE_SENDER, REQUIRE_RECIPIENT] };
            }
        }
        let sender: Address | undefined;
        let recipient: Address | undefined;
        if (context.sender !== undefined || context.recipient !== undefined) {
            sender = context.sender ?? undefined;
            recipient = context.recipient ?? undefined;
        } else if (context.invalidMarkDestination) {
            sender = SENDER;
            recipient = {
                name: "x",
                street: "x",
                houseNumber: "1",
                postalCode: "1",
                locality: "x",
                countryCode: "DE",
            };
        }
        await boundProvider(client).mark({ porto, sender, recipient });
        context.markError = undefined;
    } catch (error: unknown) {
        context.markError = captureError(error);
    }
});

When("I map the Internetmarke auth HTTP error for testing", () => {
    const trigger = context.authTriggerDetail ?? "unauthorized_prose";
    if (trigger === "unauthorized_prose") {
        const mapped = mapProviderError("deutschepost", "internetmarke", "Unauthorized", 401);
        context.markError = { code: mapped.code, message: mapped.message };
        return;
    }
    const spec = AUTH_TRIGGERS[trigger];
    if (!spec) throw new Error(`unknown Internetmarke auth test trigger: ${trigger}`);
    const info = mapInternetmarkeAuthHttpError(spec.status, spec.body, {
        endpoint: spec.endpoint,
        appTokenObtained: spec.appTokenObtained,
    });
    const mapped = new PortoError(
        info.message,
        info.code,
        spec.status,
        internetmarkeAuthErrorDetails(info),
        info.retryable,
        "deutschepost",
        "internetmarke",
    );
    context.markError = { code: mapped.code, message: mapped.message };
});

When("I map the Internetmarke mark-execution HTTP error for testing", () => {
    const trigger = context.markExecutionTriggerDetail ?? "wallet_balance_not_enough";
    const spec = MARK_EXECUTION_TRIGGERS[trigger];
    if (!spec) throw new Error(`unknown Internetmarke mark-execution test trigger: ${trigger}`);
    const vendor = extractInternetmarkeVendorErrorCode(spec.body);
    const code = mapInternetmarkeErrorCode(vendor, spec.status);
    context.markError = {
        code,
        message: `mark execution mapped: ${vendor ?? "unknown"}`,
    };
});

When("I probe Internetmarke authentication", async function () {
    const client = context.client!;
    const im =
        client.config.wires?.internetmarke ?? loadInternetmarkeConfig("deutschepost", process.env);
    if (!im) return "skipped";
    const wired = im.credentials ?? {};
    const auth = new InternetmarkeAuthImpl(
        wired.username ?? "",
        wired.password ?? "",
        getInternetmarkeBaseUrl(im),
        wired.dhl_api_key,
        wired.dhl_api_secret,
        wired.partner_id,
    );
    try {
        await auth.authenticate();
        context.markError = undefined;
    } catch (error: unknown) {
        context.markError = captureError(error);
    }
    return undefined;
});

Then("mark creation should fail", () => {
    expect(context.markError).toBeDefined();
});

Then("I should get Porto error code {string}", (code: string) => {
    const exc = context.markError ?? context.resolutionError;
    expect(exc).toBeDefined();
    const observed =
        typeof exc === "object" && exc && "code" in exc ? String(exc.code) : String(exc);
    expect(observed).toBe(code);
});
