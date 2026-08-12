import { ProjectsResponse } from '@internal/backstage-plugin-konflux-common';
import { KonfluxApiError } from '../api/konfluxApi';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxQuery } from './useKonfluxQuery';

export const useKonfluxProjects = (
    tokens: Record<string, string>,
    enabled: boolean,
): AsyncResult<Record<string, string[]>> & { error?: KonfluxApiError } => {
    const hasTokens = Object.keys(tokens).length > 0;
    const { data, loading, error, refetch } = useKonfluxQuery<ProjectsResponse>(
        ['konflux', 'projects', tokens],
        '/projects',
        { tokens },
        { enabled: enabled && hasTokens },
    );

    return {
        data: data?.projects ?? {},
        loading,
        error: error as KonfluxApiError | undefined,
        refetch,
    };
};
