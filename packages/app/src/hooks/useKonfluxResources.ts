import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    discoveryApiRef,
    fetchApiRef,
    useApi,
} from '@backstage/core-plugin-api';
import {
    ClusterPublicInfo,
    KONFLUX_TOKENS_HEADER,
    KonfluxResource,
    NamespaceMapping,
    ProjectsResponse,
    ResourcesResponse,
} from '@internal/backstage-plugin-konflux-common';

export type KonfluxAuthError = Error & {
    missingClusters?: string[];
    statusCode?: number;
};

type FetchApi = { fetch: typeof fetch };

interface ErrorBody {
    error?: string;
    missingClusters?: string[];
}

function createAuthError(
    message: string,
    missingClusters?: string[],
): KonfluxAuthError {
    const err = new Error(message) as KonfluxAuthError;
    err.statusCode = 401;
    err.missingClusters = missingClusters;
    return err;
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
    try {
        return (await response.json()) as ErrorBody;
    } catch {
        return {};
    }
}

async function konfluxFetch<T>(
    baseUrl: string,
    path: string,
    fetchApi: FetchApi,
    tokens: Record<string, string>,
    query?: Record<string, string | undefined>,
): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, value);
            }
        }
    }

    const response = await fetchApi.fetch(url.toString(), {
        headers: {
            [KONFLUX_TOKENS_HEADER]: JSON.stringify(tokens),
            Accept: 'application/json',
        },
    });

    if (response.status === 401) {
        const body = await readErrorBody(response);
        throw createAuthError(
            body.error || 'Authentication required',
            body.missingClusters,
        );
    }

    if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(
            body.error || `Request failed: HTTP ${response.status}`,
        );
    }

    return response.json() as Promise<T>;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function toAuthError(error: unknown): KonfluxAuthError {
    if (error instanceof Error) {
        return error as KonfluxAuthError;
    }
    return new Error(String(error)) as KonfluxAuthError;
}

export function useKonfluxClusters(): {
    clusters: ClusterPublicInfo[];
    loading: boolean;
    error?: Error;
    refetch: () => void;
} {
    const discoveryApi = useApi(discoveryApiRef);
    const fetchApi = useApi(fetchApiRef);
    const [clusters, setClusters] = useState<ClusterPublicInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error>();
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(undefined);
            try {
                const baseUrl = await discoveryApi.getBaseUrl('konflux');
                const data = await konfluxFetch<{
                    clusters: ClusterPublicInfo[];
                }>(baseUrl, '/clusters', fetchApi, {});
                if (!cancelled) {
                    setClusters(data.clusters);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(toError(e));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [discoveryApi, fetchApi, tick]);

    const refetch = useCallback(() => setTick(t => t + 1), []);

    return { clusters, loading, error, refetch };
}

export function useKonfluxProjects(
    tokens: Record<string, string>,
    enabled: boolean,
): {
    projects: Record<string, string[]>;
    loading: boolean;
    error?: KonfluxAuthError;
    refetch: () => void;
} {
    const discoveryApi = useApi(discoveryApiRef);
    const fetchApi = useApi(fetchApiRef);
    const [projects, setProjects] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<KonfluxAuthError>();
    const [tick, setTick] = useState(0);
    const tokensKey = useMemo(() => JSON.stringify(tokens), [tokens]);

    useEffect(() => {
        if (!enabled || Object.keys(tokens).length === 0) {
            setProjects({});
            setError(undefined);
            return undefined;
        }

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(undefined);
            try {
                const baseUrl = await discoveryApi.getBaseUrl('konflux');
                const data = await konfluxFetch<ProjectsResponse>(
                    baseUrl,
                    '/projects',
                    fetchApi,
                    tokens,
                );
                if (!cancelled) {
                    setProjects(data.projects);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(toAuthError(e));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // tokensKey captures tokens content; tokens used inside effect intentionally
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discoveryApi, fetchApi, tokensKey, enabled, tick]);

    const refetch = useCallback(() => setTick(t => t + 1), []);

    return { projects, loading, error, refetch };
}

export interface UseKonfluxResourcesOptions {
    cluster?: string;
    namespace?: string;
    search?: string;
    namespaceMappings?: NamespaceMapping[];
    enabled?: boolean;
}

export function useKonfluxResources(
    resourceType: 'applications' | 'components',
    tokens: Record<string, string>,
    options: UseKonfluxResourcesOptions = {},
): {
    data: KonfluxResource[];
    loading: boolean;
    error?: KonfluxAuthError;
    refetch: () => void;
    hasMore: boolean;
    loadMore: () => void;
} {
    const discoveryApi = useApi(discoveryApiRef);
    const fetchApi = useApi(fetchApiRef);
    const [data, setData] = useState<KonfluxResource[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<KonfluxAuthError>();
    const [continuationToken, setContinuationToken] = useState<
        string | undefined
    >();
    const [tick, setTick] = useState(0);

    const enabled = options.enabled !== false;
    const { cluster, namespace, search, namespaceMappings } = options;
    const tokensKey = useMemo(() => JSON.stringify(tokens), [tokens]);
    const mappingsKey = useMemo(
        () => JSON.stringify(namespaceMappings ?? []),
        [namespaceMappings],
    );

    const fetchPage = useCallback(
        async (continueToken?: string, append = false) => {
            if (!enabled || Object.keys(tokens).length === 0) {
                setData([]);
                setContinuationToken(undefined);
                return;
            }

            setLoading(true);
            setError(undefined);
            try {
                const baseUrl = await discoveryApi.getBaseUrl('konflux');
                const result = await konfluxFetch<ResourcesResponse>(
                    baseUrl,
                    `/resources/${resourceType}`,
                    fetchApi,
                    tokens,
                    {
                        cluster,
                        namespace,
                        search,
                        continue: continueToken,
                        namespaces:
                            namespaceMappings && namespaceMappings.length > 0
                                ? mappingsKey
                                : undefined,
                    },
                );
                setData(prev =>
                    append ? [...prev, ...result.data] : result.data,
                );
                setContinuationToken(result.continuationToken);
            } catch (e) {
                setError(toAuthError(e));
            } finally {
                setLoading(false);
            }
        },
        // tokensKey/mappingsKey stabilize object identity for deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            enabled,
            tokensKey,
            discoveryApi,
            resourceType,
            fetchApi,
            cluster,
            namespace,
            search,
            mappingsKey,
        ],
    );

    useEffect(() => {
        void fetchPage();
    }, [fetchPage, tick]);

    const refetch = useCallback(() => setTick(t => t + 1), []);

    const loadMore = useCallback(() => {
        if (continuationToken) {
            void fetchPage(continuationToken, true);
        }
    }, [continuationToken, fetchPage]);

    return {
        data,
        loading,
        error,
        refetch,
        hasMore: !!continuationToken,
        loadMore,
    };
}
