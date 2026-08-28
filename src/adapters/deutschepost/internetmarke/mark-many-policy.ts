/**
 * Internetmarke mark(many) entry checks before shopping-cart checkout.
 * Empty list or missing Porto identity → PORTO_MARK_INVALID.
 * Mixed Portos are allowed; provider rejection maps to PORTO_MARK_FAILED upstream.
 */

import { PortoError, PortoErrorCode } from "../../../errors.js";
import type { MarkExecution } from "../../../execution/index.js";

export function requireMarkManyPrepared(prepared: MarkExecution[]): void {
    if (!prepared.length) {
        throw new PortoError(
            "mark(many) requires at least one request",
            PortoErrorCode.PORTO_MARK_INVALID,
            400,
            undefined,
            false,
            "deutschepost",
            "internetmarke",
        );
    }
    for (const item of prepared) {
        if (!item.porto) {
            throw new PortoError(
                "Prepared mark is missing Porto identity",
                PortoErrorCode.PORTO_MARK_INVALID,
                400,
                undefined,
                false,
                "deutschepost",
                "internetmarke",
            );
        }
    }
}
