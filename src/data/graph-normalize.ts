import type { ResolutionGraph } from "./loader";

export function normalizeResolutionGraph(data: Record<string, unknown>): ResolutionGraph {
    const edges = (data.edges as Record<string, unknown>) ?? {};
    const links =
        edges.products && typeof edges.products === "object"
            ? (edges.products as ResolutionGraph["links"])
            : {};

    const markEdges =
        edges.marks && typeof edges.marks === "object"
            ? (edges.marks as ResolutionGraph["mark_edges"])
            : {};

    const wireEdges =
        edges.wire && typeof edges.wire === "object"
            ? (edges.wire as ResolutionGraph["wire_edges"])
            : {};

    const services = Array.isArray(data.services) ? (data.services as string[]) : [];

    const strategy = typeof data.strategy === "string" ? data.strategy : null;

    return {
        file_type: String(data.file_type ?? "graph"),
        unit: (data.unit as ResolutionGraph["unit"]) ?? {},
        dependencies: (data.dependencies as ResolutionGraph["dependencies"]) ?? {},
        links,
        mark_edges: markEdges,
        wire_edges: wireEdges,
        services,
        strategy,
        lookup_rules: (data.lookup_rules as ResolutionGraph["lookup_rules"]) ?? {},
        global_settings: (data.global_settings as ResolutionGraph["global_settings"]) ?? {},
    };
}
