export {
    KonfluxApiError,
    konfluxRequest,
    useKonfluxRequest,
    konfluxRequestOrUndefined,
} from '../api/konfluxApi';
export type { KonfluxRequestInit } from '../api/konfluxApi';

export { useKonfluxQuery } from './useKonfluxQuery';
export { useKonfluxPaginatedQuery } from './useKonfluxPaginatedQuery';
export type { KonfluxPaginatedQueryOptions } from './useKonfluxPaginatedQuery';
export { createKonfluxResourceListHook } from './useKonfluxResourceList';
export type { KonfluxResourceListOptions } from './useKonfluxResourceList';
export { createKonfluxResourceHook } from './useKonfluxResource';
export type { KonfluxResourceOptions } from './useKonfluxResource';

export { useKonfluxClusters } from './useClusters';
export { useKonfluxProjects } from './useProjects';
export { useKonfluxTokens } from './useTokens';
export { useExpireTokensOn401 } from './useExpireTokensOn401';

import { createKonfluxResourceListHook } from './useKonfluxResourceList';

/**
 * Fetch Konflux Applications on demand.
 * Scoped to specific cluster/namespace pairs.
 */
export const useKonfluxApplications = createKonfluxResourceListHook({
    resourceType: 'applications',
    queryKey: ['konflux', 'resources', 'applications'],
});

export const usePipelineRuns = createKonfluxResourceListHook({
    resourceType: 'pipelineruns',
    queryKey: ['konflux', 'resources', 'pipelineruns'],
});

export const useReleases = createKonfluxResourceListHook({
    resourceType: 'releases',
    queryKey: ['konflux', 'resources', 'releases'],
});
