import { LoggerService } from '@backstage/backend-plugin-api';
import {
    GroupVersionKind,
    K8sResourceCommonWithClusterInfo,
    KonfluxClusterMap,
} from '@internal/backstage-plugin-konflux-common';
import uniqBy from 'lodash/uniqBy';
import { StructuredLogger } from '../helpers/logger';
import {
    createBearerAuthOptions,
    getOrCreateClient,
} from '../helpers/client-factory';
import { getHttpStatusCode } from '../helpers/errors';
import { parseResponseBody, stripManagedFields } from '../helpers/k8s-response';
import { KubearchiveService } from './kubearchive-service';

export interface FetchOptions {
    limit?: number;
    labelSelector?: string;
    continue?: string;
    /** KubeArchive supports wildcard name patterns like *term* */
    fieldSelector?: string;
}

export interface FetchResult {
    items: K8sResourceCommonWithClusterInfo[];
    continueToken?: string;
}

export interface SourcePaginationState {
    k8sToken?: string;
    kubearchiveToken?: string;
}

export interface FetchContext {
    cluster: string;
    namespace: string;
    token: string;
    konfluxConfig: KonfluxClusterMap;
    resourceModel: GroupVersionKind;
}

/**
 * Applications/Components are rarely archived, but when kubearchiveApiUrl
 * is configured we still attempt a merge so archived CRs are not missed.
 * Additional resource types (pipelineruns, releases) can be added here later.
 */
const KUBEARCHIVE_ENABLED_RESOURCES = new Set([
    'applications',
    'components',
]);

export class ResourceFetcherService {
    private readonly konfluxLogger: StructuredLogger;
    private readonly kubearchiveService: KubearchiveService;

    constructor(logger: LoggerService) {
        this.konfluxLogger = new StructuredLogger(logger);
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
        fieldSelector?: string,
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
                    fieldSelector,
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
     * Fetch from live K8s, then fill from KubeArchive when K8s is exhausted.
     * Deduplicates by resource UID.
     */
    async fetchFromSource(
        context: FetchContext,
        paginationState: SourcePaginationState = {},
        options?: FetchOptions,
    ): Promise<{
        items: K8sResourceCommonWithClusterInfo[];
        newPaginationState: SourcePaginationState;
    }> {
        const { konfluxConfig, resourceModel } = context;
        const { k8sToken, kubearchiveToken } = paginationState;
        const clusterConfig = konfluxConfig.clusters?.[context.cluster];
        const hasKubearchive = this.hasKubearchive(
            resourceModel,
            context.namespace,
            clusterConfig,
        );

        if (kubearchiveToken && !k8sToken && hasKubearchive) {
            const { items, continueToken } = await this.fetchFromKubearchive(
                context,
                options?.limit,
                kubearchiveToken,
                options?.labelSelector,
                options?.fieldSelector,
            );
            return {
                items,
                newPaginationState: continueToken
                    ? { kubearchiveToken: continueToken }
                    : {},
            };
        }

        const { items: k8sItems, continueToken } =
            await this.fetchFromKubernetes(context, {
                ...options,
                continue: k8sToken,
            });

        if (continueToken) {
            return {
                items: k8sItems,
                newPaginationState: { k8sToken: continueToken },
            };
        }

        if (hasKubearchive && !k8sToken) {
            const limit = options?.limit;
            const remainingLimit =
                limit === undefined ? undefined : limit - k8sItems.length;

            if (remainingLimit === undefined || remainingLimit > 0) {
                try {
                    const {
                        items: kubearchiveItems,
                        continueToken: kaToken,
                    } = await this.fetchFromKubearchive(
                        context,
                        remainingLimit,
                        undefined,
                        options?.labelSelector,
                        options?.fieldSelector,
                    );

                    if (kubearchiveItems.length > 0) {
                        const mergedItems = uniqBy(
                            [...k8sItems, ...kubearchiveItems],
                            r => r.metadata?.uid ?? r.metadata?.name,
                        );

                        return {
                            items: mergedItems,
                            newPaginationState: kaToken
                                ? { kubearchiveToken: kaToken }
                                : {},
                        };
                    }
                } catch (error) {
                    // KubeArchive failures should not fail the whole request
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
                }
            }
        }

        return {
            items: k8sItems,
            newPaginationState: {},
        };
    }

    hasMoreData(paginationState: SourcePaginationState): boolean {
        return !!(paginationState.k8sToken || paginationState.kubearchiveToken);
    }
}
