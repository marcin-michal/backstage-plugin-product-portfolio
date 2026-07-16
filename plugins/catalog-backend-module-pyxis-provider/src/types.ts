export interface PyxisProductListing {
    _id: string;
    name: string | null;
    vendor_label: string;
    category: string | null;
    type: string | null;
    published: boolean;
    deleted?: boolean;
    team_id: string | null;
    functional_categories: string[] | null;
    descriptions: {
      short: string | null;
      long: string | null;
    } | null;
    creation_date: string;
    last_update_date: string;
}

export interface PyxisTeamMember {
    user_id: string;
    role: string | null;
}

export interface PyxisTeam {
    _id: string;
    name: string;
    vendor_label: string | null;
    jira_group_key: string | null;
    members: PyxisTeamMember[];
    creation_date: string;
    last_update_date: string;
}

export interface PyxisProviderConfig {
    graphqlUrl: string;
    certPath: string;
    keyPath: string;
    caPath?: string;
}

export interface PyxisFindResponse<T> {
    error: { status: number; detail: string } | null;
    page: number;
    page_size: number;
    total?: number;
    data: T[];
}

export interface PyxisGetResponse<T> {
    error: { status: number; detail: string } | null;
    data: T;
}

export interface UniqueUser {
    user_id: string;
    role: string | null;
    teamNames: string[];
}