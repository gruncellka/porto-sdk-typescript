/** Carrier-reported tracking time syntax, without timezone inference. */

export type OccurredKind = "offset" | "local";

export interface OccurredTime {
    value: string;
    kind: OccurredKind;
}

const DATETIME =
    /^(?<base>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d+))?(?<offset>Z|[+-]\d{2}:\d{2})?$/;

export function normalizeOccurredAt(value: unknown): OccurredTime | undefined {
    if (typeof value !== "string") return undefined;
    const match = DATETIME.exec(value.trim());
    if (!match?.groups) return undefined;

    const base = match.groups.base;
    const fraction = match.groups.fraction;
    const offset = match.groups.offset ?? "";
    if (!validDateTime(base, offset)) return undefined;

    const normalizedFraction = fraction ? `.${fraction.slice(0, 3).padEnd(3, "0")}` : "";
    return {
        value: `${base}${normalizedFraction}${offset}`,
        kind: offset ? "offset" : "local",
    };
}

function validDateTime(base: string, offset: string): boolean {
    const parts = base.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!parts) return false;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = parts;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth(year, month) ||
        hour > 23 ||
        minute > 59 ||
        second > 59
    ) {
        return false;
    }
    if (offset && offset !== "Z") {
        const [offsetHour, offsetMinute] = offset.slice(1).split(":").map(Number);
        if (offsetHour > 23 || offsetMinute > 59) return false;
    }
    return true;
}

function daysInMonth(year: number, month: number): number {
    if (month === 2) {
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
