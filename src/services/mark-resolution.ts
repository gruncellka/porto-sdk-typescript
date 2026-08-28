export function resolveMarkProfileId(input: {
    markEdges: Record<string, { profile?: string; services?: Record<string, string> }>;
    zoneId?: string | null;
    serviceIds?: string[] | null;
    defaultProfileId?: string | null;
}): string | null {
    const { markEdges, zoneId, serviceIds, defaultProfileId } = input;
    if (!zoneId) return defaultProfileId ?? null;

    const zoneEdge = markEdges[zoneId] ?? {};
    let profileId = zoneEdge.profile ?? defaultProfileId ?? null;
    const serviceMap = zoneEdge.services ?? {};

    for (const serviceId of serviceIds ?? []) {
        const override = serviceMap[serviceId];
        if (override) profileId = override;
    }

    return profileId;
}
