/** @public */
export type GroupVersionKind = {
    kind: string;
    apiVersion: string;
    apiGroup: string;
    plural: string;
};

/** @public */
export type OwnerReference = {
    apiVersion: string;
    kind: string;
    name: string;
    uid: string;
    controller?: boolean;
    blockOwnerDeletion?: boolean;
};

/** @public */
export type K8sResourceIdentifier = {
    apiGroup?: string;
    apiVersion: string;
    kind: string;
};

/** @public */
export type K8sResourceCommon = K8sResourceIdentifier &
    Partial<{
        metadata: Partial<{
            annotations: Record<string, string>;
            clusterName: string;
            creationTimestamp: string;
            deletionGracePeriodSeconds: number;
            deletionTimestamp: string;
            finalizers: string[];
            generateName: string;
            generation: number;
            labels: Record<string, string>;
            managedFields: unknown[];
            name: string;
            namespace: string;
            ownerReferences: OwnerReference[];
            resourceVersion: string;
            uid: string;
        }>;
        spec: {
            [key: string]: unknown;
        };
        status: { [key: string]: unknown };
        data: { [key: string]: unknown };
    }>;

/** @public */
export type ClusterInfo = {
    name: string;
    consoleUrl?: string;
};

/** @public */
export type K8sResourceCommonWithClusterInfo = K8sResourceCommon & {
    cluster: ClusterInfo;
};

/** @public */
export type ApplicationResource = K8sResourceCommonWithClusterInfo & {
    kind: 'Application';
    [key: string]: unknown;
};

/** @public */
export type ComponentResource = K8sResourceCommonWithClusterInfo & {
    kind: 'Component';
    [key: string]: unknown;
};

/** @public */
export type KonfluxResource =
    | ApplicationResource
    | ComponentResource
    | K8sResourceCommonWithClusterInfo;

/** @public */
export interface KonfluxClusterConfig {
    /** Display name for the cluster */
    name?: string;
    apiUrl?: string;
    consoleUrl?: string;
    /** Konflux UI base URL (for Open-in-Konflux links). */
    uiUrl?: string;
    kubearchiveApiUrl?: string;
    serviceToken?: string;
    /** ReleasePlanAdmissions are in the managed namespaces. */
    managedNamespaces?: string[];
}

/** @public */
export interface KonfluxConfig {
    clusters: Record<string, KonfluxClusterConfig>;
}

/** @public */
export type ClusterPublicInfo = {
    id: string;
    name: string;
    consoleUrl?: string;
    uiUrl?: string;
    hasKubearchive: boolean;
};

/** @public */
export type ClusterError = {
    cluster: string;
    namespace?: string;
    errorType?: string;
    message?: string;
    statusCode?: number;
    source?: 'kubernetes' | 'kubearchive' | 'projects';
    resourceType?: string;
};

/** @public */
export type NamespaceMapping = {
    cluster: string;
    namespace: string;
};

/** @public */
export type ResourcesResponse = {
    data: KonfluxResource[];
    clusterErrors?: ClusterError[];
    continuationToken?: string;
};

/** @public */
export type ProjectsResponse = {
    projects: Record<string, string[]>;
    clusterErrors?: ClusterError[];
};
