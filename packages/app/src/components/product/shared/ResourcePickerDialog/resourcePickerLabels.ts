import { UnmatchedApp } from '@internal/backstage-plugin-konflux-common';
import { clusterDisplayName } from '../../utils/konfluxUrls';
import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';

export const appChipLabel = (
    app: Pick<UnmatchedApp, 'title' | 'name' | 'namespace' | 'cluster'>,
    clusters: ClusterPublicInfo[],
): string => {
    const name = app.title ?? app.name;
    return `${name} · ${app.namespace} (${clusterDisplayName(
        clusters,
        app.cluster,
    )})`;
};
