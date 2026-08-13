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
    KonfluxClusterMap,
    ProductStoreConfig,
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
    DEFAULT_PRODUCT_CONFIG_PATH,
    DEFAULT_PRODUCTS_PATH,
} from './consts';

export {
    getResourceDisplayName,
} from './resources';