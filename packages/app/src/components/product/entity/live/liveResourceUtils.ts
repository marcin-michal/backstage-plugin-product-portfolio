import {
    ClusterPublicInfo,
    KonfluxAppSummary,
    KonfluxResource,
    NamespaceMapping,
    PipelineRunLabel,
} from '@internal/backstage-plugin-konflux-common';

type Condition = {
    type?: string;
    status?: string;
    reason?: string;
};

export function uniqueProductClusterIds(
    applications: KonfluxAppSummary[],
): string[] {
    return [
        ...new Set(
            applications.map(app => app.cluster).filter(id => id.length > 0),
        ),
    ];
}

export function productClustersFromApps(
    applications: KonfluxAppSummary[],
    clusters: ClusterPublicInfo[],
): ClusterPublicInfo[] {
    return uniqueProductClusterIds(applications).map(id => {
        const found = clusters.find(cluster => cluster.id === id);
        return found ?? { id, name: id, hasKubearchive: false };
    });
}

export function namespaceMappingsFromApps(
    applications: KonfluxAppSummary[],
): NamespaceMapping[] {
    const seen = new Set<string>();
    const mappings: NamespaceMapping[] = [];

    for (const app of applications) {
        if (!app.cluster || !app.namespace) {
            continue;
        }
        const key = `${app.cluster}/${app.namespace}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        mappings.push({ cluster: app.cluster, namespace: app.namespace });
    }

    return mappings;
}

export function tokensForClusters(
    tokens: Record<string, string>,
    clusterIds: string[],
): Record<string, string> {
    const allowed = new Set(clusterIds);
    const filtered: Record<string, string> = {};
    for (const [id, token] of Object.entries(tokens)) {
        if (allowed.has(id)) {
            filtered[id] = token;
        }
    }
    return filtered;
}

export function resourceKey(resource: KonfluxResource, index: number): string {
    return (
        resource.metadata?.uid ||
        [
            resource.cluster?.name,
            resource.metadata?.namespace,
            resource.metadata?.name,
            String(index),
        ]
            .filter(Boolean)
            .join('/')
    );
}

export function resourceClusterId(resource: KonfluxResource): string {
    return resource.cluster?.name ?? '';
}

export function resourceLabel(
    resource: KonfluxResource,
    key: string,
): string | undefined {
    return resource.metadata?.labels?.[key];
}

export function pipelineRunType(resource: KonfluxResource): string | undefined {
    return resourceLabel(resource, PipelineRunLabel.PIPELINE_TYPE);
}

export function pipelineRunComponent(
    resource: KonfluxResource,
): string | undefined {
    return resourceLabel(resource, PipelineRunLabel.COMPONENT);
}

function readStatusString(
    resource: KonfluxResource,
    key: string,
): string | undefined {
    const value = resource.status?.[key];
    return typeof value === 'string' ? value : undefined;
}

export function pipelineRunStartTime(
    resource: KonfluxResource,
): string | undefined {
    return readStatusString(resource, 'startTime');
}

function readConditions(resource: KonfluxResource): Condition[] {
    const raw = resource.status?.conditions;
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.filter(
        (item): item is Condition => !!item && typeof item === 'object',
    );
}

export function pipelineRunStatus(resource: KonfluxResource): string {
    const succeeded = readConditions(resource).find(
        c => c.type === 'Succeeded',
    );

    if (!succeeded?.status) {
        return 'Pending';
    }

    if (succeeded.status === 'True') {
        return 'Succeeded';
    }

    if (succeeded.status === 'False') {
        const reason = succeeded.reason ?? '';

        if (
            reason.includes('Cancelled') ||
            reason.includes('StoppedRunFinally')
        ) {
            return 'Cancelled';
        }

        return 'Failed';
    }

    return 'Running';
}

export function releaseStatus(resource: KonfluxResource): string {
    const released = readConditions(resource).find(c => c.type === 'Released');
    if (!released) {
        return 'Unknown';
    }

    if (released.status === 'True' && released.reason === 'Succeeded') {
        return 'Succeeded';
    }

    if (released.reason === 'Progressing') {
        return 'In Progress';
    }

    if (released.reason === 'Failed' && released.status === 'False') {
        return 'Failed';
    }

    return 'Pending';
}

export function formatTimestamp(value?: string): string {
    if (!value) {
        return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export function statusChipColor(
    status: string,
): 'primary' | 'secondary' | 'default' {
    if (status === 'Succeeded') {
        return 'primary';
    }

    if (status === 'Failed') {
        return 'secondary';
    }

    return 'default';
}
