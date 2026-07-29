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
}

type ContinuationPayload = {
    sources: Array<{
        cluster: string;
        namespace: string;
        state: SourcePaginationState;
    }>;
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
     * Fetch Applications or Components across the user's accessible tenant
     * namespaces (or entity annotation mappings when present).
     */
    async fetchResources(query: ResourceQuery): Promise<ResourcesResponse> {
        const resourceModel = konfluxResourceModels[query.resourceType];
        if (!resourceModel) {
            throw new Error(
                `Invalid resource type '${query.resourceType}'. Supported: ${Object.keys(konfluxResourceModels).join(', ')}`,
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
        const allItems: KonfluxResource[] = [];
        const nextSources: ContinuationPayload['sources'] = [];

        await mapPool(targets, FETCH_CONCURRENCY, async target => {
            const existingState =
                paginationState?.sources.find(
                    s =>
                        s.cluster === target.cluster &&
                        s.namespace === target.namespace,
                )?.state ?? {};

            if (
                query.continue &&
                !existingState.k8sToken &&
                !existingState.kubearchiveToken
            ) {
                const wasTracked = paginationState?.sources.some(
                    s =>
                        s.cluster === target.cluster &&
                        s.namespace === target.namespace,
                );
                if (wasTracked) {
                    return;
                }
            }

            try {
                const { items, newPaginationState } =
                    await this.resourceFetcher.fetchFromSource(
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
                            fieldSelector: query.search
                                ? `metadata.name=*${query.search}*`
                                : undefined,
                        },
                    );

                const clusterInfo = {
                    name: target.cluster,
                    consoleUrl:
                        this.config.clusters[target.cluster]?.consoleUrl,
                };

                for (const item of items) {
                    allItems.push({
                        ...item,
                        cluster: clusterInfo,
                    });
                }

                nextSources.push({
                    cluster: target.cluster,
                    namespace: target.namespace,
                    state: this.resourceFetcher.hasMoreData(newPaginationState)
                        ? newPaginationState
                        : {},
                });
            } catch (error) {
                const statusCode = getHttpStatusCode(error);

                // Soft-skip namespaces the user cannot list in, or that do not
                // expose this CRD — same idea as Konflux only showing usable tenants.
                if (statusCode === 403 || statusCode === 404) {
                    this.logger.debug(
                        'Skipping namespace for resource fetch',
                        {
                            cluster: target.cluster,
                            namespace: target.namespace,
                            resource: query.resourceType,
                            statusCode,
                        },
                    );
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

        let filtered = allItems;
        if (query.search) {
            const term = query.search.toLowerCase();
            filtered = allItems.filter(item => {
                const name = item.metadata?.name?.toLowerCase() ?? '';
                const displayName =
                    getResourceDisplayName(item)?.toLowerCase() ?? '';
                return name.includes(term) || displayName.includes(term);
            });
        }

        filtered.sort((a, b) => {
            const aTime = a.metadata?.creationTimestamp ?? '';
            const bTime = b.metadata?.creationTimestamp ?? '';
            return bTime.localeCompare(aTime);
        });

        const hasMore = nextSources.some(
            s => s.state.k8sToken || s.state.kubearchiveToken,
        );

        return {
            data: filtered,
            clusterErrors,
            continuationToken: hasMore
                ? encodeContinuation({ sources: nextSources })
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

function decodeContinuation(
    token?: string,
): ContinuationPayload | undefined {
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
