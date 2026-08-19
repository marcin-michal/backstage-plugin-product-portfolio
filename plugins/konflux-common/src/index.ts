/**
 * Shared types and models for the Konflux plugin.
 *
 * @packageDocumentation
 */

export type {
    GroupVersionKind,
    OwnerReference,
    K8sResourceIdentifier,
    K8sResourceCommon,
    ClusterInfo,
    K8sResourceCommonWithClusterInfo,
    ApplicationResource,
    ComponentResource,
    KonfluxResource,
    KonfluxClusterConfig,
    KonfluxConfig,
    ClusterPublicInfo,
    ClusterError,
    NamespaceMapping,
    ResourcesResponse,
    ProjectsResponse,
} from './types';

export type {
    ProductDefinition,
    CreateProductRequest,
} from './product-definition';

export type {
    ProductListItem,
    ProductsListResponse,
    KonfluxAppSummary,
    KonfluxComponentSummary,
    PyxisListingSummary,
    PyxisRepositorySummary,
    ProductComposition,
    ManualOverrideType,
    ManualOverrideItem,
    SyncStatus,
    UnmatchedApp,
} from './product-api';

export {
    ApplicationGVK,
    ComponentGVK,
    ModelsPlural,
    konfluxResourceModels,
} from './models';

export { KONFLUX_TOKENS_HEADER, PAGINATION_CONFIG } from './consts';

export { getResourceDisplayName } from './resources';
