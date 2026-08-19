/** Catalog System metadata for a product (created via the Products page). */
/** @public */
export interface ProductDefinition {
    /** Backstage entity ref, e.g. "system:default/my-product" */
    entityRef: string;
    /** Entity metadata.name (URL-safe) */
    name: string;
    /** Entity metadata.namespace */
    namespace: string;
    title?: string;
    description?: string;
    /** Owner entity ref, e.g. "group:default/guests" */
    owner: string;
    createdAt: string;
    createdBy?: string;
}

/** Request body for creating a product System. */
/** @public */
export interface CreateProductRequest {
    name: string;
    title?: string;
    description?: string;
    namespace?: string;
    owner?: string;
}
