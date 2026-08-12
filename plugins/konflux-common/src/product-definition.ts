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

/**
 * A {@link ProductDefinition} enriched with its composition status.
 *
 * `composed` is derived at read-time by joining the product store with the
 * product-config store — it is not persisted alongside the definition — so
 * it lives on this separate response type rather than on
 * {@link ProductDefinition} itself.
 */
/** @public */
export interface ManagedProduct extends ProductDefinition {
    composed: boolean;
}

/** Response body for `GET /products`. */
/** @public */
export interface ProductsListResponse {
    products: ManagedProduct[];
    composedEntityRefs: string[];
}
