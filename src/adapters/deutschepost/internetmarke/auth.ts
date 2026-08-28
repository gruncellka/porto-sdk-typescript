/**
 * Deutsche Post Internetmarke Authentication
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import { HttpClient, type Transport } from "../../../transport/http-client.js";
import {
    InternetmarkeAuthEndpoint,
    internetmarkeAuthErrorDetails,
    mapInternetmarkeAuthHttpError,
} from "./auth-errors.js";
import { parseWalletBalanceCents } from "./utils.js";

const DEFAULT_BASE_URL = "https://api-eu.dhl.com/post/de/shipping/im/v1";

export interface InternetmarkeAuth {
    authenticate(): Promise<void>;
    getToken(): string | null;
    getWalletBalanceCents(): number | null;
}

export class InternetmarkeAuthImpl implements InternetmarkeAuth {
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private walletBalanceCents: number | null = null;
    private readonly httpClient: Transport;

    constructor(
        private username: string,
        private password: string,
        private baseUrl: string = DEFAULT_BASE_URL,
        private apiKey?: string,
        private apiSecret?: string,
        private partnerId?: string,
        httpClient?: Transport,
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.httpClient = httpClient ?? new HttpClient();
    }

    async authenticate(): Promise<void> {
        if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
            return;
        }

        if (!this.apiKey || !this.apiSecret) {
            throw new PortoError(
                "DHL API client_id and client_secret are required for INTERNETMARKE auth",
                PortoErrorCode.PORTO_AUTH_FAILED,
                401,
                {},
                false,
                "deutschepost",
                "internetmarke",
            );
        }

        const authUrl = `${this.baseUrl}/user`;
        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.apiKey,
            client_secret: this.apiSecret,
            username: this.username,
            password: this.password,
        }).toString();

        const headers: Record<string, string> = {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(this.partnerId && { "X-Partner-ID": this.partnerId }),
        };

        let response: Response;
        try {
            response = await this.httpClient.request({
                method: "POST",
                url: authUrl,
                headers,
                body,
                idempotent: true,
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new PortoError(
                "Network error connecting to INTERNETMARKE authentication endpoint",
                PortoErrorCode.PORTO_NETWORK_UNAVAILABLE,
                503,
                { url: authUrl, error: msg },
                true,
                "deutschepost",
                "internetmarke",
            );
        }

        if (!response.ok) {
            let errorText = "";
            try {
                errorText = await response.text();
            } catch {
                /* ignore */
            }
            const authError = mapInternetmarkeAuthHttpError(response.status, errorText, {
                endpoint: InternetmarkeAuthEndpoint.COMBINED_USER,
            });
            throw new PortoError(
                authError.message,
                authError.code,
                response.status,
                {
                    ...internetmarkeAuthErrorDetails(authError),
                    statusCode: response.status,
                    url: authUrl,
                },
                authError.retryable,
                "deutschepost",
                "internetmarke",
            );
        }

        const rawData = (await response.json()) as Record<string, unknown> & {
            access_token?: string;
            userToken?: string;
            token?: string;
            expires_in?: number;
        };
        const token = rawData.access_token ?? rawData.userToken ?? rawData.token ?? null;
        if (!token) {
            throw new PortoError(
                "No access_token in INTERNETMARKE auth response",
                PortoErrorCode.PORTO_AUTH_FAILED,
                500,
                { responseKeys: Object.keys(rawData) },
                false,
                "deutschepost",
                "internetmarke",
            );
        }
        const expiresIn = rawData.expires_in ?? 3000;
        this.token = token;
        this.tokenExpiresAt = Date.now() + expiresIn * 1000;
        this.walletBalanceCents = parseWalletBalanceCents(rawData);
    }

    getToken(): string | null {
        return this.token;
    }

    getWalletBalanceCents(): number | null {
        return this.walletBalanceCents;
    }
}
