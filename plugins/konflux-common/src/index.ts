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
    SavedApplicationSnapshot,
    KonfluxResourceBinding,
    PyxisBinding,
    ProductConfig,
    ProductConfigWriteRequest,
} from './product-config';

export type {
    ProductDefinition,
    CreateProductRequest,
    ManagedProduct,
    ProductsListResponse,
} from './product-definition';

export {
    ApplicationGVK,
    ComponentGVK,
    ModelsPlural,
    konfluxResourceModels,
} from './models';

export {
    KONFLUX_TOKENS_HEADER,
    PAGINATION_CONFIG,
} from './consts';

export {
    getResourceDisplayName,
} from './resources';