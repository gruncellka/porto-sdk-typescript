/** Browser build shims — embedded PortoClient never calls filesystem/network Node APIs. */

export function existsSync(): boolean {
    return false;
}

export function readFileSync(): never {
    throw new Error("filesystem unavailable in browser PortoClient");
}

export function mkdirSync(): void {
    throw new Error("filesystem unavailable in browser PortoClient");
}

export function writeFileSync(): void {
    throw new Error("filesystem unavailable in browser PortoClient");
}

export function readdirSync(): string[] {
    return [];
}

export function statSync(): never {
    throw new Error("filesystem unavailable in browser PortoClient");
}

export function createHash(): { update(): { digest(): string } } {
    return {
        update() {
            return { digest: () => "" };
        },
    };
}

export function createRequire(): never {
    throw new Error("require unavailable in browser PortoClient");
}

export function dirname(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : ".";
}

export function join(...parts: string[]): string {
    return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

/** Enough for execution-registry bundledDir; never used for real I/O in browser. */
export function fileURLToPath(url: string | URL): string {
    const raw = typeof url === "string" ? url : url.href;
    if (raw.startsWith("file://")) {
        return decodeURIComponent(raw.slice("file://".length));
    }
    return raw;
}

/** Stamp ZIP inflate is server-only; browser compose never downloads marks. */
export function inflateRawSync(_data: Uint8Array): never {
    throw new Error("zlib unavailable in browser PortoClient");
}

export function deflateRawSync(_data: Uint8Array): never {
    throw new Error("zlib unavailable in browser PortoClient");
}
