import { useQuery } from '@tanstack/react-query';
import {
    KonfluxApiError,
    KonfluxRequestInit,
    useKonfluxRequest,
} from '../api/konfluxApi';
import { AsyncResult } from '../api/queryTypes';

/**
 * Thin wrapper around `useQuery` for simple GET endpoints that return `T`.
 * Returns an {@link AsyncResult} where `data` is `T | undefined` (undefined
 * while loading or if the request has not yet run).
 *
 * For paginated endpoints use {@link useKonfluxPaginatedQuery} instead.
 * For mutations use `useMutation` + {@link useKonfluxRequest} directly.
 *
 * ```ts
 * const { data, loading, error, refetch } =
 *   useKonfluxQuery<{ clusters: ClusterPublicInfo[] }>(
 *     ['konflux', 'clusters'], '/clusters',
 *   );
 * return { clusters: data?.clusters ?? [], loading, error, refetch };
 * ```
 */
export const useKonfluxQuery = <T>(
    queryKey: readonly unknown[],
    path: string,
    init?: KonfluxRequestInit,
    options?: { enabled?: boolean },
): AsyncResult<T | undefined> => {
    const request = useKonfluxRequest();
    const query = useQuery({
        queryKey,
        queryFn: () => request<T>(path, init),
        enabled: options?.enabled,
    });

    return {
        data: query.data,
        loading: query.isLoading,
        error: (query.error as KonfluxApiError) ?? undefined,
        refetch: () => void query.refetch(),
    };
};
