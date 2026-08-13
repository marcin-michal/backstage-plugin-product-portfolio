import { useQuery } from '@tanstack/react-query';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import type { CatalogApi } from '@backstage/catalog-client';
import { AsyncResult } from '../api/queryTypes';

/**
 * Base wrapper for Backstage catalog reads. Mirrors the shape of
 * {@link useBackendQuery} so all product hooks present the same contract.
 *
 * ```ts
 * const { data, loading, error, refetch } = useCatalogQuery(
 *   ['catalog', 'pyxis-listings'],
 *   api => api.getEntities({ filter: { ... } }).then(r => r.items),
 * );
 * ```
 */
export const useCatalogQuery = <T>(
    queryKey: readonly unknown[],
    queryFn: (api: CatalogApi) => Promise<T>,
    options?: { enabled?: boolean },
): AsyncResult<T | undefined> => {
    const catalogApi = useApi(catalogApiRef);
    const query = useQuery({
        queryKey,
        queryFn: () => queryFn(catalogApi),
        enabled: options?.enabled,
    });

    return {
        data: query.data,
        loading: query.isLoading,
        error: query.error ?? undefined,
        refetch: () => void query.refetch(),
    };
};
