import { LoggerService } from '@backstage/backend-plugin-api';
import {
    GroupVersionKind,
    K8sResourceCommonWithClusterInfo,
    KonfluxConfig,
} from '@internal/backstage-plugin-konflux-common';
import uniqBy from 'lodash/uniqBy';
import { KonfluxLogger } from '../helpers/logger';
import {
    createBearerAuthOptions,
    getOrCreateClient,
} from '../helpers/client-factory';
import { getHttpStatusCode } from '../helpers/errors';
import { KubearchiveService } from './kubearchive-service';

export interface FetchOptions {
    limit?: number;
    labelSelector?: string;
    continue?: string;
    /**
     * KubeArchive `name` filter (wildcards like *term*). Live Kubernetes
     * listing does not receive this — name search is applied client-side.
     */
    name?: string;
}

export interface FetchResult {
    items: K8sResourceCommonWithClusterInfo[];
    continueToken?: string;
}

export interface SourcePaginationState {
    /** Continue token for the current, not-yet-consumed Kubernetes page. */
    k8sToken?: string;
    k8sExhausted?: boolean;
    /** Continue token for the current, not-yet-consumed KubeArchive page. */
    kubearchiveToken?: string;
    kubearchiveExhausted?: boolean;
}

export interface FetchContext {
    cluster: string;
    namespace: string;
    token: string;
    konfluxConfig: KonfluxConfig;
    resourceModel: GroupVersionKind;
}

/**
 * PipelineRuns and Releases age out of live etcd; Kubearchive is the
 * historical source. Applications/Components are rarely archived, but when
 * kubearchiveApiUrl is configured we still attempt a merge so archived CRs
 * are not missed.
 */
const KUBEARCHIVE_ENABLED_RESOURCES = new Set([
    'applications',
    'components',
    'pipelineruns',
    'releases',
]);

export class ResourceFetcherService {
    private readonly konfluxLogger: KonfluxLogger;
    private readonly kubearchiveService: KubearchiveService;

    constructor(logger: LoggerService) {
        this.konfluxLogger = new KonfluxLogger(logger);
        this.kubearchiveService = new KubearchiveService(logger);
    }

    async fetchFromKubernetes(
        context: FetchContext,
        options?: FetchOptions,
    ): Promise<FetchResult> {
        const { cluster, namespace, token, konfluxConfig, resourceModel } =
            context;

        const customApi = await getOrCreateClient(
            konfluxConfig,
            cluster,
            this.konfluxLogger,
        );
        if (!customApi) {
            throw new Error(`Cluster '${cluster}' not found`);
        }

        try {
            const { apiGroup, apiVersion, plural } = resourceModel;
            const requestOptions = await createBearerAuthOptions(token);

            const response =
                await customApi.listNamespacedCustomObjectWithHttpInfo(
                    {
                        group: apiGroup,
                        version: apiVersion,
                        namespace,
                        plural,
                        _continue: options?.continue,
                        labelSelector: options?.labelSelector,
                        limit: options?.limit,
                    },
                    requestOptions,
                );

            const responseBody = parseResponseBody(response?.data);
            const items = stripManagedFields(responseBody?.items ?? []);
            const continueToken = responseBody?.metadata?.continue;

            this.konfluxLogger.info('Fetched resources from Kubernetes', {
                cluster,
                namespace,
                resource: plural,
                itemCount: items.length,
                hasMore: !!continueToken,
            });

            return { items, continueToken };
        } catch (error) {
            const statusCode = getHttpStatusCode(error);
            // 404 usually means the CRD/API is unavailable in this namespace —
            // common when scanning non-Konflux tenants; callers treat as soft errors.
            if (statusCode === 404) {
                this.konfluxLogger.warn(
                    `Resource API not found for ${resourceModel.plural} in ${cluster}/${namespace}`,
                    {
                        cluster,
                        namespace,
                        resource: resourceModel.plural,
                        statusCode,
                    },
                );
            } else {
                this.konfluxLogger.error(
                    `Error fetching ${resourceModel.plural} from ${cluster}/${namespace}`,
                    error,
                    {
                        cluster,
                        namespace,
                        resource: resourceModel.plural,
                    },
                );
            }
            throw error;
        }
    }

    async fetchFromKubearchive(
        context: FetchContext,
        pageSize?: number,
        pageToken?: string,
        labelSelector?: string,
        name?: string,
    ): Promise<FetchResult> {
        const { cluster, namespace, token, konfluxConfig, resourceModel } =
            context;

        const { results, nextPageToken } =
            await this.kubearchiveService.fetchResources({
                konfluxConfig,
                token,
                cluster,
                apiGroup: resourceModel.apiGroup,
                apiVersion: resourceModel.apiVersion,
                resource: resourceModel.plural,
                namespace,
                options: {
                    pageSize,
                    pageToken,
                    labelSelector,
                    name,
                },
            });

        return {
            items: results || [],
            continueToken: nextPageToken,
        };
    }

    private hasKubearchive(
        resourceModel: GroupVersionKind,
        namespace: string,
        clusterConfig: { kubearchiveApiUrl?: string } | undefined,
    ): boolean {
        return (
            KUBEARCHIVE_ENABLED_RESOURCES.has(resourceModel.plural) &&
            !!namespace &&
            !!clusterConfig?.kubearchiveApiUrl
        );
    }

    /**
     * Fetch one Kubernetes page and one KubeArchive page in parallel.
     * Does not slice to `limit` — the caller merges streams and returns an
     * exact page so live+archive results are not concatenated into 2× limit.
     */
    async fetchFromSource(
        context: FetchContext,
        paginationState: SourcePaginationState = {},
        options?: FetchOptions,
    ): Promise<{
        items: K8sResourceCommonWithClusterInfo[];
        k8sUids: string[];
        archiveUids: string[];
        k8sNextToken?: string;
        archiveNextToken?: string;
        k8sHasMorePages: boolean;
        archiveHasMorePages: boolean;
        archiveAvailable: boolean;
    }> {
        const { konfluxConfig, resourceModel } = context;
        const {
            k8sToken,
            k8sExhausted,
            kubearchiveToken,
            kubearchiveExhausted,
        } = paginationState;
        const clusterConfig = konfluxConfig.clusters?.[context.cluster];
        const archiveAvailable = this.hasKubearchive(
            resourceModel,
            context.namespace,
            clusterConfig,
        );

        const shouldFetchK8s = !k8sExhausted;
        const shouldFetchArchive = archiveAvailable && !kubearchiveExhausted;

        const [k8sResult, archiveResult] = await Promise.all([
            shouldFetchK8s
                ? this.fetchFromKubernetes(context, {
                      ...options,
                      continue: k8sToken,
                  })
                : Promise.resolve({ items: [], continueToken: undefined }),
            shouldFetchArchive
                ? this.fetchFromKubearchive(
                      context,
                      options?.limit,
                      kubearchiveToken,
                      options?.labelSelector,
                      options?.name,
                  ).catch(error => {
                      this.konfluxLogger.warn(
                          'KubeArchive fetch failed; returning live results only',
                          {
                              cluster: context.cluster,
                              namespace: context.namespace,
                              resource: resourceModel.plural,
                              error:
                                  error instanceof Error
                                      ? error.message
                                      : String(error),
                          },
                      );
                      return { items: [], continueToken: undefined };
                  })
                : Promise.resolve({ items: [], continueToken: undefined }),
        ]);

        const items = uniqBy(
            [...k8sResult.items, ...archiveResult.items],
            r => r.metadata?.uid ?? r.metadata?.name,
        );

        return {
            items,
            k8sUids: k8sResult.items.map(resourceUid),
            archiveUids: archiveResult.items.map(resourceUid),
            k8sNextToken: k8sResult.continueToken,
            archiveNextToken: archiveResult.continueToken,
            k8sHasMorePages: !!k8sResult.continueToken,
            archiveHasMorePages: !!archiveResult.continueToken,
            archiveAvailable,
        };
    }
}

function parseResponseBody(data: unknown):
    | {
          items: K8sResourceCommonWithClusterInfo[];
          metadata?: { continue?: string };
      }
    | undefined {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data) as {
                items: K8sResourceCommonWithClusterInfo[];
                metadata?: { continue?: string };
            };
        } catch {
            return undefined;
        }
    }
    if (typeof data === 'object' && data !== null) {
        return data as {
            items: K8sResourceCommonWithClusterInfo[];
            metadata?: { continue?: string };
        };
    }
    return undefined;
}

function stripManagedFields(
    items: K8sResourceCommonWithClusterInfo[],
): K8sResourceCommonWithClusterInfo[] {
    return items.map(item => {
        if (!item.metadata?.managedFields) {
            return item;
        }
        const { managedFields, ...metadata } = item.metadata;
        void managedFields;
        return { ...item, metadata };
    });
}

export function resourceUid(item: K8sResourceCommonWithClusterInfo): string {
    return (
        item.metadata?.uid ||
        `${item.metadata?.namespace ?? ''}/${item.metadata?.name ?? ''}`
    );
}
