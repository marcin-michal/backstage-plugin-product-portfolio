import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
    ClusterError,
    ClusterPublicInfo,
    KonfluxConfig,
    KonfluxResource,
    PAGINATION_CONFIG,
    ProjectsResponse,
    ResourcesResponse,
    getResourceDisplayName,
    konfluxResourceModels,
} from '@internal/backstage-plugin-konflux-common';
import { getKonfluxConfig } from '../helpers/config';
import { errorMessage, getHttpStatusCode } from '../helpers/errors';
import { KonfluxLogger } from '../helpers/logger';
import { NamespaceDiscoveryService } from './namespace-discovery';
import {
    ResourceFetcherService,
    SourcePaginationState,
    resourceUid,
} from './resource-fetcher';

export type ClusterTokens = Record<string, string>;

export interface ResourceQuery {
    resourceType: string;
    tokens: ClusterTokens;
    cluster?: string;
    namespace?: string;
    search?: string;
    limit?: number;
    continue?: string;
    /** Optional pre-filter: only these cluster+namespace pairs */
    namespaceMappings?: Array<{ cluster: string; namespace: string }>;
    /** Kubernetes label selector applied to live and archive list calls. */
    labelSelector?: string;
}

type ContinuationPayload = {
    sources: Array<{
        cluster: string;
        namespace: string;
        state: SourcePaginationState;
    }>;
    /** UIDs already returned (or skipped) from the current unconsumed source pages. */
    emittedUids?: string[];
};

type FetchTarget = {
    cluster: string;
    namespace: string;
    token: string;
};

/** Cap parallel namespace fetches so we do not stampede the API server. */
const FETCH_CONCURRENCY = 8;

export class KonfluxService {
    private readonly logger: KonfluxLogger;
    private readonly config: KonfluxConfig;
    private readonly namespaceDiscovery: NamespaceDiscoveryService;
    private readonly resourceFetcher: ResourceFetcherService;

    private constructor(logger: LoggerService, config: KonfluxConfig) {
        this.logger = new KonfluxLogger(logger);
        this.config = config;
        this.namespaceDiscovery = new NamespaceDiscoveryService(logger);
        this.resourceFetcher = new ResourceFetcherService(logger);
    }

    static fromConfig(
        rootConfig: Config,
        logger: LoggerService,
    ): KonfluxService {
        const konfluxLogger = new KonfluxLogger(logger);
        const config = getKonfluxConfig(rootConfig, konfluxLogger) ?? {
            clusters: {},
        };
        return new KonfluxService(logger, config);
    }

    listClusters(): ClusterPublicInfo[] {
        return Object.entries(this.config.clusters).map(([id, cluster]) => ({
            id,
            name: cluster.name ?? id,
            consoleUrl: cluster.consoleUrl,
            uiUrl: cluster.uiUrl,
            hasKubearchive: !!cluster.kubearchiveApiUrl,
        }));
    }

    getConfig(): KonfluxConfig {
        return this.config;
    }

    /**
     * List Konflux tenant namespaces the user can access.
     * Uses the same tenancy signal as Konflux UI (`konflux-ci.dev/type=tenant`).
     */
    async listProjects(tokens: ClusterTokens): Promise<ProjectsResponse> {
        const projects: Record<string, string[]> = {};
        const clusterErrors: ClusterError[] = [];

        const clusterIds = Object.keys(this.config.clusters).filter(
            id => !!tokens[id],
        );

        await Promise.all(
            clusterIds.map(async clusterId => {
                const clusterConfig = this.config.clusters[clusterId];
                if (!clusterConfig?.apiUrl) {
                    clusterErrors.push({
                        cluster: clusterId,
                        message: 'Cluster missing apiUrl',
                        source: 'projects',
                    });
                    return;
                }

                try {
                    projects[clusterId] =
                        await this.namespaceDiscovery.listAccessibleTenantNamespaces(
                            clusterConfig.apiUrl,
                            tokens[clusterId],
                            clusterId,
                        );
                } catch (error) {
                    const statusCode = getHttpStatusCode(error);
                    clusterErrors.push({
                        cluster: clusterId,
                        message: errorMessage(error),
                        statusCode,
                        source: 'projects',
                        errorType:
                            statusCode === 401 ? 'unauthorized' : 'fetch_error',
                    });
                }
            }),
        );

        return { projects, clusterErrors };
    }

    /**
     * Fetch Konflux resources across the user's accessible tenant namespaces
     * (or explicit namespace mappings when present).
     */
    async fetchResources(query: ResourceQuery): Promise<ResourcesResponse> {
        const resourceModel = konfluxResourceModels[query.resourceType];
        if (!resourceModel) {
            throw new Error(
                `Invalid resource type '${
                    query.resourceType
                }'. Supported: ${Object.keys(konfluxResourceModels).join(
                    ', ',
                )}`,
            );
        }

        const targets = await this.resolveFetchTargets(query);
        if (targets.length === 0) {
            return { data: [], clusterErrors: [] };
        }

        this.logger.info('Fetching resources across namespaces', {
            resource: query.resourceType,
            targetCount: targets.length,
        });

        const paginationState = decodeContinuation(query.continue);
        const limit = query.limit ?? PAGINATION_CONFIG.DEFAULT_PAGE_SIZE;
        const clusterErrors: ClusterError[] = [];
        const fetched: Array<{
            cluster: string;
            namespace: string;
            existingState: SourcePaginationState;
            items: KonfluxResource[];
            k8sUids: string[];
            archiveUids: string[];
            k8sNextToken?: string;
            archiveNextToken?: string;
            k8sHasMorePages: boolean;
            archiveHasMorePages: boolean;
            archiveAvailable: boolean;
        }> = [];

        await mapPool(targets, FETCH_CONCURRENCY, async target => {
            const existingState =
                paginationState?.sources.find(
                    s =>
                        s.cluster === target.cluster &&
                        s.namespace === target.namespace,
                )?.state ?? {};

            if (isSourceExhausted(existingState)) {
                fetched.push({
                    cluster: target.cluster,
                    namespace: target.namespace,
                    existingState,
                    items: [],
                    k8sUids: [],
                    archiveUids: [],
                    k8sHasMorePages: false,
                    archiveHasMorePages: false,
                    archiveAvailable:
                        existingState.kubearchiveExhausted === false,
                });
                return;
            }

            try {
                const page = await this.resourceFetcher.fetchFromSource(
                    {
                        cluster: target.cluster,
                        namespace: target.namespace,
                        token: target.token,
                        konfluxConfig: this.config,
                        resourceModel,
                    },
                    existingState,
                    {
                        limit,
                        labelSelector: query.labelSelector,
                        name: query.search ? `*${query.search}*` : undefined,
                    },
                );

                const clusterInfo = {
                    name: target.cluster,
                    consoleUrl:
                        this.config.clusters[target.cluster]?.consoleUrl,
                };

                fetched.push({
                    cluster: target.cluster,
                    namespace: target.namespace,
                    existingState,
                    items: page.items.map(item => ({
                        ...item,
                        cluster: clusterInfo,
                    })),
                    k8sUids: page.k8sUids,
                    archiveUids: page.archiveUids,
                    k8sNextToken: page.k8sNextToken,
                    archiveNextToken: page.archiveNextToken,
                    k8sHasMorePages: page.k8sHasMorePages,
                    archiveHasMorePages: page.archiveHasMorePages,
                    archiveAvailable: page.archiveAvailable,
                });
            } catch (error) {
                const statusCode = getHttpStatusCode(error);

                if (statusCode === 403 || statusCode === 404) {
                    this.logger.debug('Skipping namespace for resource fetch', {
                        cluster: target.cluster,
                        namespace: target.namespace,
                        resource: query.resourceType,
                        statusCode,
                    });
                    return;
                }

                clusterErrors.push({
                    cluster: target.cluster,
                    namespace: target.namespace,
                    message: errorMessage(error),
                    statusCode,
                    source: 'kubernetes',
                    resourceType: query.resourceType,
                    errorType:
                        statusCode === 401 ? 'unauthorized' : 'fetch_error',
                });
            }
        });

        const emitted = new Set(paginationState?.emittedUids ?? []);
        const searchTerm = query.search?.toLowerCase();

        const allItems = fetched.flatMap(entry => entry.items);
        const uniqueItems = uniqByUid(allItems);

        for (const item of uniqueItems) {
            if (searchTerm && !matchesSearch(item, searchTerm)) {
                emitted.add(resourceUid(item));
            }
        }

        const candidates = uniqueItems
            .filter(item => !emitted.has(resourceUid(item)))
            .sort((a, b) => {
                const aTime = a.metadata?.creationTimestamp ?? '';
                const bTime = b.metadata?.creationTimestamp ?? '';
                return bTime.localeCompare(aTime);
            });

        const pageItems = candidates.slice(0, limit);
        for (const item of pageItems) {
            emitted.add(resourceUid(item));
        }

        const nextSources: ContinuationPayload['sources'] = fetched.map(
            entry => ({
                cluster: entry.cluster,
                namespace: entry.namespace,
                state: nextSourceState(entry, emitted),
            }),
        );

        const heldUids = new Set<string>();
        for (const entry of fetched) {
            const state = nextSources.find(
                s =>
                    s.cluster === entry.cluster &&
                    s.namespace === entry.namespace,
            )?.state;
            const k8sPageHeld =
                !!state &&
                !state.k8sExhausted &&
                state.k8sToken === entry.existingState.k8sToken;
            const archivePageHeld =
                !!state &&
                !state.kubearchiveExhausted &&
                state.kubearchiveToken === entry.existingState.kubearchiveToken;
            if (k8sPageHeld) {
                for (const uid of entry.k8sUids) {
                    heldUids.add(uid);
                }
            }
            if (archivePageHeld) {
                for (const uid of entry.archiveUids) {
                    heldUids.add(uid);
                }
            }
        }

        const nextEmitted = [...emitted].filter(uid => heldUids.has(uid));
        const hasMore =
            candidates.length > limit ||
            nextSources.some(s => !isSourceExhausted(s.state));

        return {
            data: pageItems,
            clusterErrors,
            continuationToken: hasMore
                ? encodeContinuation({
                      sources: nextSources,
                      emittedUids: nextEmitted,
                  })
                : undefined,
        };
    }

    private async resolveFetchTargets(
        query: ResourceQuery,
    ): Promise<FetchTarget[]> {
        const targets: FetchTarget[] = [];

        // Product System annotation: only those namespaces
        if (query.namespaceMappings && query.namespaceMappings.length > 0) {
            for (const mapping of query.namespaceMappings) {
                if (query.cluster && mapping.cluster !== query.cluster) {
                    continue;
                }
                if (query.namespace && mapping.namespace !== query.namespace) {
                    continue;
                }
                const token = query.tokens[mapping.cluster];
                if (!token || !this.config.clusters[mapping.cluster]) {
                    continue;
                }
                targets.push({
                    cluster: mapping.cluster,
                    namespace: mapping.namespace,
                    token,
                });
            }
            return targets;
        }

        const clusterIds = Object.keys(this.config.clusters).filter(id => {
            if (!query.tokens[id]) {
                return false;
            }
            if (query.cluster && id !== query.cluster) {
                return false;
            }
            return true;
        });

        // Explicit namespace filter across authenticated clusters
        if (query.namespace) {
            for (const clusterId of clusterIds) {
                targets.push({
                    cluster: clusterId,
                    namespace: query.namespace,
                    token: query.tokens[clusterId],
                });
            }
            return targets;
        }

        // Discover Konflux tenant namespaces the user can access (Konflux UI model)
        for (const clusterId of clusterIds) {
            const clusterConfig = this.config.clusters[clusterId];
            if (!clusterConfig?.apiUrl) {
                continue;
            }

            try {
                const namespaces =
                    await this.namespaceDiscovery.listAccessibleTenantNamespaces(
                        clusterConfig.apiUrl,
                        query.tokens[clusterId],
                        clusterId,
                    );
                for (const ns of namespaces) {
                    targets.push({
                        cluster: clusterId,
                        namespace: ns,
                        token: query.tokens[clusterId],
                    });
                }
            } catch (error) {
                this.logger.warn(
                    'Failed to discover tenant namespaces for resource fetch',
                    {
                        cluster: clusterId,
                        error: errorMessage(error),
                    },
                );
            }
        }

        return targets;
    }
}

function isSourceExhausted(state: SourcePaginationState): boolean {
    return !!state.k8sExhausted && !!state.kubearchiveExhausted;
}

function nextSourceState(
    entry: {
        existingState: SourcePaginationState;
        k8sUids: string[];
        archiveUids: string[];
        k8sNextToken?: string;
        archiveNextToken?: string;
        k8sHasMorePages: boolean;
        archiveHasMorePages: boolean;
        archiveAvailable: boolean;
    },
    emitted: Set<string>,
): SourcePaginationState {
    if (isSourceExhausted(entry.existingState)) {
        return entry.existingState;
    }

    const k8sPageConsumed =
        entry.k8sUids.length === 0 ||
        entry.k8sUids.every(uid => emitted.has(uid));
    const archivePageConsumed =
        entry.archiveUids.length === 0 ||
        entry.archiveUids.every(uid => emitted.has(uid));

    const state: SourcePaginationState = {};

    if (entry.existingState.k8sExhausted) {
        state.k8sExhausted = true;
    } else if (k8sPageConsumed) {
        if (entry.k8sHasMorePages) {
            state.k8sToken = entry.k8sNextToken;
        } else {
            state.k8sExhausted = true;
        }
    } else {
        state.k8sToken = entry.existingState.k8sToken;
    }

    if (!entry.archiveAvailable || entry.existingState.kubearchiveExhausted) {
        state.kubearchiveExhausted = true;
    } else if (archivePageConsumed) {
        if (entry.archiveHasMorePages) {
            state.kubearchiveToken = entry.archiveNextToken;
        } else {
            state.kubearchiveExhausted = true;
        }
    } else {
        state.kubearchiveToken = entry.existingState.kubearchiveToken;
    }

    return state;
}

function uniqByUid(items: KonfluxResource[]): KonfluxResource[] {
    const seen = new Set<string>();
    const unique: KonfluxResource[] = [];
    for (const item of items) {
        const uid = resourceUid(item);
        if (seen.has(uid)) {
            continue;
        }
        seen.add(uid);
        unique.push(item);
    }
    return unique;
}

function matchesSearch(item: KonfluxResource, term: string): boolean {
    const name = item.metadata?.name?.toLowerCase() ?? '';
    const displayName = getResourceDisplayName(item)?.toLowerCase() ?? '';
    return name.includes(term) || displayName.includes(term);
}

/**
 * Run async work over items with a fixed concurrency limit.
 */
async function mapPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    if (items.length === 0) {
        return;
    }

    const limit = Math.max(1, concurrency);
    let nextIndex = 0;

    const runners = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (nextIndex < items.length) {
                const current = items[nextIndex];
                nextIndex += 1;
                await worker(current);
            }
        },
    );

    await Promise.all(runners);
}

function encodeContinuation(payload: ContinuationPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeContinuation(token?: string): ContinuationPayload | undefined {
    if (!token) {
        return undefined;
    }
    try {
        return JSON.parse(
            Buffer.from(token, 'base64url').toString('utf8'),
        ) as ContinuationPayload;
    } catch {
        return undefined;
    }
}
