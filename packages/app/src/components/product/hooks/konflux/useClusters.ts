import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxQuery } from './useKonfluxQuery';

export const useKonfluxClusters = (): AsyncResult<ClusterPublicInfo[]> => {
    const { data, loading, error, refetch } = useKonfluxQuery<{
        clusters: ClusterPublicInfo[];
    }>(['konflux', 'clusters'], '/clusters');

    return { data: data?.clusters ?? [], loading, error, refetch };
};
