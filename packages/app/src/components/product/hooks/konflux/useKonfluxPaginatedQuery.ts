import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    KonfluxResource,
    ResourcesResponse,
} from '@internal/backstage-plugin-konflux-common';
import { BackendApiError, useBackendRequest } from '../api/backendApi';
import { PaginatedResult } from '../api/queryTypes';

export interface KonfluxPaginatedQueryOptions {
    cluster?: string;
    namespace?: string;
    search?: string;
    /** Pre-serialized JSON of `NamespaceMapping[]` for multi-namespace queries. */
    namespaces?: string;
    enabled?: boolean;
    /** Additional backend query params (e.g. `application`, `labelSelector`). */
    query?: Record<string, string | undefined>;
}

/**
 * Generic paginated list base for Konflux `ResourcesResponse` endpoints.
 *
 * - Wraps `useInfiniteQuery`; automatically pages through `continuationToken`.
 * - Flattens all fetched pages into a single `data` array.
 * - Only starts fetching when at least one token is supplied (or `enabled` is
 *   explicitly set to `false` to suppress the request entirely).
 *
 * Prefer using named per-type hooks built with
 * {@link createKonfluxResourceListHook} over calling this directly.
 */
export const useKonfluxPaginatedQuery = (
    queryKey: readonly unknown[],
    path: string,
    tokens: Record<string, string>,
    options: KonfluxPaginatedQueryOptions = {},
): PaginatedResult<KonfluxResource> => {
    const request = useBackendRequest();
    const hasTokens = Object.keys(tokens).length > 0;
    const enabled = (options.enabled ?? true) && hasTokens;

    const query = useInfiniteQuery({
        queryKey: [
            ...queryKey,
            tokens,
            options.cluster,
            options.namespace,
            options.search,
            options.namespaces,
            options.query,
        ],
        queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
            request<ResourcesResponse>(path, {
                tokens,
                query: {
                    cluster: options.cluster,
                    namespace: options.namespace,
                    search: options.search,
                    namespaces: options.namespaces,
                    continue: pageParam,
                    ...options.query,
                },
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: last => last.continuationToken,
        enabled,
    });

    const data = useMemo(
        () => query.data?.pages.flatMap(page => page.data) ?? [],
        [query.data],
    );

    return {
        data,
        loading: query.isLoading,
        error: (query.error as BackendApiError) ?? undefined,
        refetch: () => void query.refetch(),
        hasMore: query.hasNextPage ?? false,
        loadMore: () => void query.fetchNextPage(),
        isFetchingMore: query.isFetchingNextPage,
    };
};
