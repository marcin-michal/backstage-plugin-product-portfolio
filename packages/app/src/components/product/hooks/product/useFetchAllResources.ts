import { useCallback } from 'react';
import {
    KonfluxResource,
    NamespaceMapping,
    ResourcesResponse,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxRequestInit, useKonfluxRequest } from '../api/konfluxApi';

/**
 * Returns an imperative `fetchAll(path, options)` function that pages through
 * a `ResourcesResponse` endpoint until all results are collected.
 *
 * Designed for one-shot workflows (migration, refresh) where a React Query
 * infinite hook is not appropriate.
 *
 * ```ts
 * const fetchAll = useFetchAllResources(tokens);
 * const apps = await fetchAll('/resources/applications', {
 *   namespaceMappings: [...],
 * });
 * ```
 */
export const useFetchAllResources = (
    tokens: Record<string, string>,
): ((
    path: string,
    options?: {
        namespaceMappings?: NamespaceMapping[];
        query?: Record<string, string | undefined>;
    },
) => Promise<KonfluxResource[]>) => {
    const request = useKonfluxRequest();

    return useCallback(
        async (
            path: string,
            options: {
                namespaceMappings?: NamespaceMapping[];
                query?: Record<string, string | undefined>;
            } = {},
        ): Promise<KonfluxResource[]> => {
            const all: KonfluxResource[] = [];
            let continueToken: string | undefined;
            const namespaces =
                options.namespaceMappings?.length
                    ? JSON.stringify(options.namespaceMappings)
                    : undefined;

            do {
                const init: KonfluxRequestInit = {
                    tokens,
                    query: {
                        ...options.query,
                        namespaces,
                        continue: continueToken,
                    },
                };
                const result = await request<ResourcesResponse>(path, init);
                all.push(...result.data);
                continueToken = result.continuationToken;
            } while (continueToken);

            return all;
        },
        [request, tokens],
    );
};
