import {
    KonfluxResource,
    KonfluxResourceBinding,
    NamespaceMapping,
    getResourceDisplayName,
} from '@internal/backstage-plugin-konflux-common';

export const konfluxBindingKey = (binding: {
    cluster: string;
    namespace: string;
    application: string;
}): string => {
    return `${binding.cluster}\0${binding.namespace}\0${binding.application}`;
};

export const bindingsToNamespaceMappings = (
    bindings: KonfluxResourceBinding[],
): NamespaceMapping[] => {
    const seen = new Set<string>();
    const mappings: NamespaceMapping[] = [];
    for (const binding of bindings) {
        const key = `${binding.cluster}\0${binding.namespace}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        mappings.push({
            cluster: binding.cluster,
            namespace: binding.namespace,
        });
    }
    return mappings;
};

export const applicationToBinding = (
    app: KonfluxResource,
): KonfluxResourceBinding | undefined => {
    const cluster = app.cluster?.name;
    const namespace = app.metadata?.namespace;
    const application = app.metadata?.name;
    if (!cluster || !namespace || !application) {
        return undefined;
    }
    return {
        cluster,
        namespace,
        application,
        snapshot: {
            displayName: getResourceDisplayName(app),
            creationTimestamp: app.metadata?.creationTimestamp,
            fetchedAt: new Date().toISOString(),
        },
    };
};
