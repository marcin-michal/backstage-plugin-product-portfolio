import { ClusterPublicInfo, KonfluxResourceBinding } from '@internal/backstage-plugin-konflux-common';

export const clusterLabel = (
    clusters: ClusterPublicInfo[],
    clusterId: string,
): string => {
    return clusters.find(c => c.id === clusterId)?.name || clusterId;
};

export const bindingChipLabel = (
    binding: KonfluxResourceBinding,
    clusters: ClusterPublicInfo[],
): string => {
    const name = binding.snapshot?.displayName ?? binding.application;
    return `${name} · ${binding.namespace} (${clusterLabel(
        clusters,
        binding.cluster,
    )})`;
};
