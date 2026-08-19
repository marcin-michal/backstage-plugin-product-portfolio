/**
 * API response types for the konflux-backend product endpoints.
 *
 * @packageDocumentation
 */

export interface ProductListItem {
    entityRef: string;
    name: string;
    namespace: string;
    title?: string;
    description?: string;
    owner: string;
    source: 'auto_discovered' | 'manual';
    pinned: boolean;
    /** Whether at least one Konflux app is linked (auto or manual). */
    hasKonfluxMatch: boolean;
    pyxisListingEntityRef?: string;
}

export interface ProductsListResponse {
    products: ProductListItem[];
    total: number;
}

export interface KonfluxAppSummary {
    entityRef: string;
    name: string;
    title?: string;
    cluster: string;
    namespace: string;
    applicationName: string;
    componentCount: number;
    matchSource: 'auto' | 'manual';
}

export interface KonfluxComponentSummary {
    name: string;
    entityRef: string;
    applicationEntityRef: string;
    cluster: string;
    namespace: string;
    applicationName: string;
    matchSource: 'auto' | 'manual';
}

export interface PyxisListingSummary {
    entityRef: string;
    name: string;
    title?: string;
    pyxisId?: string;
    matchSource: 'auto' | 'manual';
}

export interface PyxisRepositorySummary {
    entityRef: string;
    name: string;
    title?: string;
    /** Value of the `redhat.com/repository` annotation. */
    repository?: string;
    listingEntityRef?: string;
    listingTitle?: string;
}

/** Full composition of a product System. */
export interface ProductComposition {
    entityRef: string;
    title?: string;
    description?: string;
    source: 'auto' | 'manual';
    konfluxApplications: KonfluxAppSummary[];
    konfluxComponents: KonfluxComponentSummary[];
    pyxisListings: PyxisListingSummary[];
    repositories: PyxisRepositorySummary[];
    manualOverrides: ManualOverrideItem[];
}

export type ManualOverrideType =
    | 'add_konflux'
    | 'remove_konflux'
    | 'add_pyxis'
    | 'remove_pyxis';

export interface ManualOverrideItem {
    id: string;
    overrideType: ManualOverrideType;
    resourceKey: string;
    createdBy?: string;
    createdAt: string;
}

export interface SyncStatus {
    konfluxApplicationCount: number;
    konfluxComponentCount: number;
    autoDiscoveredProductCount: number;
    manualProductCount: number;
}

export interface UnmatchedApp {
    entityRef: string;
    name: string;
    title?: string;
    cluster: string;
    namespace: string;
    applicationName: string;
}
