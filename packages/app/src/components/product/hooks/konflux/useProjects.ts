import { ProjectsResponse } from '@internal/backstage-plugin-konflux-common';
import { BackendApiError } from '../api/backendApi';
import { AsyncResult } from '../api/queryTypes';
import { useBackendQuery } from '../api/useBackendQuery';

export const useKonfluxProjects = (
    tokens: Record<string, string>,
    enabled: boolean,
): AsyncResult<Record<string, string[]>> & { error?: BackendApiError } => {
    const hasTokens = Object.keys(tokens).length > 0;
    const { data, loading, error, refetch } = useBackendQuery<ProjectsResponse>(
        ['konflux', 'projects', tokens],
        '/projects',
        { tokens },
        { enabled: enabled && hasTokens },
    );

    return {
        data: data?.projects ?? {},
        loading,
        error: error as BackendApiError | undefined,
        refetch,
    };
};
