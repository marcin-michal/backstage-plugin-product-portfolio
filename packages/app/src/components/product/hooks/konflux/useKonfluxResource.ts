import { useMemo } from 'react';
import { KonfluxResource } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxPaginatedQuery } from './useKonfluxPaginatedQuery';

export interface KonfluxResourceOptions {
    cluster: string;
    namespace: string;
    name: string;
    enabled?: boolean;
}

interface CreateKonfluxResourceHookParams {
    /** Backend resource type (e.g. `'applications'`). */
    resourceType: string;
    /** TanStack Query key prefix. */
    queryKey: readonly unknown[];
}

/**
 * Factory that produces a typed single-resource hook for any Konflux resource.
 *
 * Implementation uses a scoped list (cluster + namespace) with a client-side
 * name filter. When the backend gains a dedicated GET endpoint, only the
 * factory internals need updating — call sites stay unchanged.
 *
 * ```ts
 * const useApplication = createKonfluxResourceHook({
 *   resourceType: 'applications',
 *   queryKey: ['konflux', 'resource', 'application'],
 * });
 * ```
 */
export const createKonfluxResourceHook = ({
    resourceType,
    queryKey: baseQueryKey,
}: CreateKonfluxResourceHookParams): ((
    tokens: Record<string, string>,
    options: KonfluxResourceOptions,
) => AsyncResult<KonfluxResource | undefined>) => {
    return (
        tokens: Record<string, string>,
        options: KonfluxResourceOptions,
    ): AsyncResult<KonfluxResource | undefined> => {
        const result = useKonfluxPaginatedQuery(
            [...baseQueryKey, options.cluster, options.namespace, options.name],
            `/resources/${resourceType}`,
            tokens,
            {
                cluster: options.cluster,
                namespace: options.namespace,
                enabled:
                    options.enabled !== false &&
                    !!options.cluster &&
                    !!options.namespace,
            },
        );

        const resource = useMemo(
            () => result.data.find(r => r.metadata?.name === options.name),
            [result.data, options.name],
        );

        return {
            data: resource,
            loading: result.loading,
            error: result.error,
            refetch: result.refetch,
        };
    };
};
