/** Per-cluster configuration read from app-config. */
export interface KonfluxClusterProviderConfig {
    clusterId: string;
    apiUrl: string;
    serviceToken: string;
    managedNamespaces: string[];
}

export interface K8sListItem {
    metadata?: {
        name?: string;
        labels?: Record<string, string>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface K8sResource {
    apiVersion?: string;
    kind?: string;
    metadata?: {
        name?: string;
        namespace?: string;
        uid?: string;
        creationTimestamp?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        [key: string]: unknown;
    };
    spec?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface K8sListResponse {
    items?: unknown[];
    metadata?: { continue?: string; [key: string]: unknown };
}

export interface RpaMappingComponent {
    name?: string;
    repository?: string;
    repositories?: Array<{ url?: string }>;
}

/**
 * In-memory RPA lookup built once per sync cycle.
 * Keys are `{originNamespace}/{applicationName}`.
 */
export type RpaIndex = Map<string, RpaAppEntry>;

export interface RpaAppEntry {
    /** component name -> list of target repository URLs */
    components: Map<string, string[]>;
    /** all target repos across every component */
    allRepos: string[];
}
