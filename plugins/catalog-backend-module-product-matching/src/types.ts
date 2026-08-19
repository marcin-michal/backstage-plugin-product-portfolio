export interface RepoToKonfluxRow {
    normalized_repo: string;
    entity_ref: string;
    cluster: string;
    namespace: string;
    app_name: string;
    updated_at: string;
}

export interface RepoToPyxisRow {
    normalized_repo: string;
    entity_ref: string;
    pyxis_id: string;
    updated_at: string;
}

export interface ListingRepoRow {
    listing_entity_ref: string;
    repo_entity_ref: string;
}

export interface ProductSystemRow {
    id: string;
    pyxis_listing_entity_ref: string;
    pyxis_listing_name: string | null;
    system_entity_ref: string;
    has_konflux_match: boolean;
    updated_at: string;
}
