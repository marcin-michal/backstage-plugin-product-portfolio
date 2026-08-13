import { useQuery } from '@tanstack/react-query';
import {
    BackendApiError,
    BackendRequestInit,
    useBackendRequest,
} from './backendApi';
import { AsyncResult } from './queryTypes';

/**
 * Thin wrapper around `useQuery` for simple GET endpoints that return `T`.
 * Returns an {@link AsyncResult} where `data` is `T | undefined` (undefined
 * while loading or if the request has not yet run).
 *
 * For paginated endpoints use {@link useKonfluxPaginatedQuery} instead.
 * For mutations use `useMutation` + {@link useBackendRequest} directly.
 *
 * ```ts
 * const { data, loading, error, refetch } =
 *   useBackendQuery<{ clusters: ClusterPublicInfo[] }>(
 *     ['konflux', 'clusters'], '/clusters',
 *   );
 * return { clusters: data?.clusters ?? [], loading, error, refetch };
 * ```
 */
export const useBackendQuery = <T>(
    queryKey: readonly unknown[],
    path: string,
    init?: BackendRequestInit,
    options?: { enabled?: boolean },
): AsyncResult<T | undefined> => {
    const request = useBackendRequest();
    const query = useQuery({
        queryKey,
        queryFn: () => request<T>(path, init),
        enabled: options?.enabled,
    });

    return {
        data: query.data,
        loading: query.isLoading,
        error: (query.error as BackendApiError) ?? undefined,
        refetch: () => void query.refetch(),
    };
};
