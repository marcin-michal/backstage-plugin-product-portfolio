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

export {
    ApplicationGVK,
    ComponentGVK,
    ModelsPlural,
    konfluxResourceModels,
} from './models';

export {
    KONFLUX_NAMESPACES_ANNOTATION,
    KONFLUX_TOKENS_HEADER,
    PAGINATION_CONFIG,
} from './consts';

export {
    parseNamespaceMappings,
    getResourceDisplayName,
    getComponentApplication,
    getComponentGitUrl,
} from './resources';
