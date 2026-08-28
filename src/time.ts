/**
 * Canonical SDK time encodings.
 *
 * Configuration durations are seconds. Convert to milliseconds only at
 * setTimeout / sleep / monotonic age boundaries.
 */

export type Seconds = number & { readonly __brand: "seconds" };

export function seconds(value: number): Seconds {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`seconds must be a non-negative finite number, got ${value}`);
    }
    return value as Seconds;
}

export function secondsToMs(value: Seconds | number): number {
    return Number(value) * 1000;
}

export function toSeconds(value: Seconds | number): Seconds {
    return seconds(Number(value));
}
