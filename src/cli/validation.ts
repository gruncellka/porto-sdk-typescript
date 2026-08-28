/**
 * CLI validation. Single responsibility: required-option checks.
 */

export function listMissingOptions(
    opts: Record<string, unknown>,
    required: Array<{ key: string; flag: string }>,
): string[] {
    return required
        .filter(({ key }) => {
            const value = opts[key];
            return value === undefined || value === null || value === "";
        })
        .map(({ flag }) => flag);
}

export function ensureRequiredOptions(
    commandName: string,
    opts: Record<string, unknown>,
    required: Array<{ key: string; flag: string }>,
): void {
    const missing = listMissingOptions(opts, required);
    if (missing.length === 0) {
        return;
    }
    throw new Error(`Missing required options for '${commandName}': ${missing.join(", ")}.`);
}
