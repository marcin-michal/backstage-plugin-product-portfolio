import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useBackendQuery } from '../api/useBackendQuery';

export const useKonfluxClusters = (): AsyncResult<ClusterPublicInfo[]> => {
    const { data, loading, error, refetch } = useBackendQuery<{
        clusters: ClusterPublicInfo[];
    }>(['konflux', 'clusters'], '/clusters');

    return { data: data?.clusters ?? [], loading, error, refetch };
};
