import {
    KonfluxResource,
    NamespaceMapping,
} from '@internal/backstage-plugin-konflux-common';
import { PaginatedResult } from '../api/queryTypes';
import {
    KonfluxPaginatedQueryOptions,
    useKonfluxPaginatedQuery,
} from './useKonfluxPaginatedQuery';

export interface KonfluxResourceListOptions
    extends Omit<KonfluxPaginatedQueryOptions, 'namespaces'> {
    /** Restrict results to these specific cluster/namespace pairs. */
    namespaceMappings?: NamespaceMapping[];
}

interface CreateKonfluxResourceListHookParams {
    /**
     * Backend resource type (e.g. `'applications'`, `'components'`).
     * Used to build `/resources/:resourceType` unless `path` is provided.
     */
    resourceType?: string;
    /**
     * Explicit backend path (overrides `resourceType`).
     * Use for endpoints that don't follow the `/resources/:type` pattern.
     */
    path?: string;
    /** TanStack Query key prefix (should be unique per resource type). */
    queryKey: readonly unknown[];
}

/**
 * Factory that produces a typed paginated-list hook for any Konflux resource.
 *
 * Adding a new resource type (e.g. pipeline runs) is a one-liner:
 *
 * ```ts
 * export const usePipelineRuns = createKonfluxResourceListHook({
 *   resourceType: 'pipelineruns',
 *   queryKey: ['konflux', 'resources', 'pipelineruns'],
 * });
 * ```
 *
 * The produced hook accepts `(tokens, options?)` where `options` includes the
 * standard filters (`cluster`, `namespace`, `search`, `namespaceMappings`) and
 * an open `query` map for any additional backend params that arrive later
 * (e.g. `application`, `labelSelector`) — no factory changes needed.
 */
export const createKonfluxResourceListHook = ({
    resourceType,
    path: explicitPath,
    queryKey,
}: CreateKonfluxResourceListHookParams): ((
    tokens: Record<string, string>,
    options?: KonfluxResourceListOptions,
) => PaginatedResult<KonfluxResource>) => {
    const resolvedPath = explicitPath ?? `/resources/${resourceType}`;

    return (
        tokens: Record<string, string>,
        options: KonfluxResourceListOptions = {},
    ): PaginatedResult<KonfluxResource> => {
        const namespaces =
            options.namespaceMappings && options.namespaceMappings.length > 0
                ? JSON.stringify(options.namespaceMappings)
                : undefined;

        return useKonfluxPaginatedQuery(queryKey, resolvedPath, tokens, {
            cluster: options.cluster,
            namespace: options.namespace,
            search: options.search,
            namespaces,
            enabled: options.enabled,
            query: options.query,
        });
    };
};
