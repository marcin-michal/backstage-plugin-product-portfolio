import { UnmatchedApp } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxQuery } from '../konflux/useKonfluxQuery';

export const useUnmatchedApps = (
    enabled = true,
): AsyncResult<UnmatchedApp[]> => {
    const { data, loading, error, refetch } = useKonfluxQuery<{
        unmatched: UnmatchedApp[];
    }>(['konflux', 'unmatched'], '/unmatched', undefined, { enabled });

    return { data: data?.unmatched ?? [], loading, error, refetch };
};
