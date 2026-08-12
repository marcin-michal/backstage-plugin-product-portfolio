/**
 * User-curated product composition: which Konflux Applications and Pyxis
 * product listings belong to a Backstage System (product).
 *
 * @packageDocumentation
 */

/** Snapshot of a Konflux Application captured at configure/refresh time. */
/** @public */
export interface SavedApplicationSnapshot {
    displayName?: string;
    creationTimestamp?: string;
    componentCount?: number;
    /** When this snapshot was last refreshed from the cluster */
    fetchedAt: string;
}

/**
 * Binding of a single Konflux Application to a product System.
 * Identifies the resource by cluster + namespace + application name.
 */
/** @public */
export interface KonfluxResourceBinding {
    /** Cluster config ID (e.g. "cluster1") */
    cluster: string;
    /** Tenant namespace */
    namespace: string;
    /** Application resource name (metadata.name) */
    application: string;
    /** Optional snapshot for display when a live token is unavailable */
    snapshot?: SavedApplicationSnapshot;
}

/** Binding of a Pyxis product-listing catalog entity to a product System. */
/** @public */
export interface PyxisBinding {
    /** Backstage entity ref, e.g. "component:default/my-product-listing" */
    entityRef: string;
    /** Human-readable label for display */
    label?: string;
}

/** Persisted product composition for one System entity. */
/** @public */
export interface ProductConfig {
    /** Backstage entity ref, e.g. "system:default/my-product" */
    entityRef: string;
    /** When this config was last modified (ISO timestamp) */
    updatedAt: string;
    /** Who last modified this config (Backstage user entity ref) */
    updatedBy?: string;
    /** Konflux Applications bound to this product */
    konfluxBindings: KonfluxResourceBinding[];
    /** Pyxis product listing entity refs bound to this product */
    pyxisBindings: PyxisBinding[];
}

/** Request body for creating/updating a product config. */
/** @public */
export interface ProductConfigWriteRequest {
    konfluxBindings: KonfluxResourceBinding[];
    pyxisBindings: PyxisBinding[];
}
