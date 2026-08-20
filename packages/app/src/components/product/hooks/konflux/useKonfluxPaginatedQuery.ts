import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    KonfluxResource,
    PAGINATION_CONFIG,
    ResourcesResponse,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxApiError, useKonfluxRequest } from '../api/konfluxApi';
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
    pageSize?: number;
}

/**
 * Generic paginated list base for Konflux `ResourcesResponse` endpoints.
 *
 * - Wraps `useInfiniteQuery`; each continuation token is one page.
 * - Exposes the current page only (not a flattened dump of every page).
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
    const request = useKonfluxRequest();
    const hasTokens = Object.keys(tokens).length > 0;
    const enabled = (options.enabled ?? true) && hasTokens;
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSizeState] = useState(
        options.pageSize ?? PAGINATION_CONFIG.DEFAULT_PAGE_SIZE,
    );

    const pageResetKey = [
        options.cluster,
        options.namespace,
        options.search,
        options.namespaces,
        JSON.stringify(options.query ?? {}),
        Object.keys(tokens).sort().join(','),
        String(pageSize),
    ].join('|');

    useEffect(() => {
        setPageIndex(0);
    }, [pageResetKey]);

    const query = useInfiniteQuery({
        queryKey: [
            ...queryKey,
            tokens,
            options.cluster,
            options.namespace,
            options.search,
            options.namespaces,
            options.query,
            pageSize,
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
                    limit: String(pageSize),
                    ...options.query,
                },
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: last => last.continuationToken,
        enabled,
    });

    const loadedPages = query.data?.pages.length ?? 0;
    const fetchNextPage = query.fetchNextPage;
    const hasQueryNextPage = query.hasNextPage ?? false;
    const isFetchingNextPage = query.isFetchingNextPage;

    useEffect(() => {
        if (loadedPages > 0 && pageIndex >= loadedPages) {
            setPageIndex(loadedPages - 1);
        }
    }, [loadedPages, pageIndex]);

    const data = useMemo(
        () => query.data?.pages[pageIndex]?.data ?? [],
        [query.data, pageIndex],
    );

    const hasNextPage = pageIndex + 1 < loadedPages || hasQueryNextPage;

    const nextPage = useCallback(() => {
        if (pageIndex + 1 < loadedPages) {
            setPageIndex(current => current + 1);
            return;
        }
        if (!hasQueryNextPage || isFetchingNextPage) {
            return;
        }
        void fetchNextPage().then(result => {
            if ((result.data?.pages.length ?? 0) > pageIndex + 1) {
                setPageIndex(current => current + 1);
            }
        });
    }, [
        fetchNextPage,
        hasQueryNextPage,
        isFetchingNextPage,
        loadedPages,
        pageIndex,
    ]);

    const previousPage = useCallback(() => {
        setPageIndex(current => Math.max(0, current - 1));
    }, []);

    const setPageSize = useCallback((size: number) => {
        setPageSizeState(size);
        setPageIndex(0);
    }, []);

    return {
        data,
        loading: query.isLoading,
        error: (query.error as KonfluxApiError) ?? undefined,
        refetch: () => void query.refetch(),
        page: pageIndex,
        pageSize,
        setPageSize,
        hasNextPage,
        hasPreviousPage: pageIndex > 0,
        nextPage,
        previousPage,
        isFetchingPage: query.isFetchingNextPage || query.isFetching,
    };
};
