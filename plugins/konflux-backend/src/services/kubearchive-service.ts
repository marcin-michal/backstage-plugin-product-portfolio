import { LoggerService } from '@backstage/backend-plugin-api';
import {
    K8sResourceCommonWithClusterInfo,
    KonfluxConfig,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxLogger } from '../helpers/logger';
import {
    createBearerAuthOptions,
    getOrCreateClient,
} from '../helpers/client-factory';

interface FetchResourcesOptions {
    konfluxConfig: KonfluxConfig;
    token: string;
    cluster: string;
    apiGroup: string;
    apiVersion: string;
    resource: string;
    namespace: string;
    options?: {
        pageSize?: number;
        pageToken?: string;
        labelSelector?: string;
        fieldSelector?: string;
    };
}

export class KubearchiveService {
    private readonly logger: KonfluxLogger;

    constructor(logger: LoggerService) {
        this.logger = new KonfluxLogger(logger);
    }

    async fetchResources(
        params: FetchResourcesOptions,
    ): Promise<{
        results: K8sResourceCommonWithClusterInfo[];
        nextPageToken?: string;
    }> {
        const {
            konfluxConfig,
            token,
            cluster,
            apiGroup,
            apiVersion,
            resource,
            namespace,
            options = {},
        } = params;

        try {
            const customApi = await getOrCreateClient(
                konfluxConfig,
                cluster,
                this.logger,
                true, // useKubearchiveUrl
            );
            if (!customApi) {
                throw new Error(
                    `Cluster '${cluster}' not found or missing kubearchiveApiUrl`,
                );
            }

            const requestOptions = await createBearerAuthOptions(token);
            const response =
                await customApi.listNamespacedCustomObjectWithHttpInfo(
                    {
                        group: apiGroup,
                        version: apiVersion,
                        namespace,
                        plural: resource,
                        _continue: options.pageToken,
                        labelSelector: options.labelSelector,
                        fieldSelector: options.fieldSelector,
                        limit: options.pageSize,
                    },
                    requestOptions,
                );

            const responseBody = parseResponseBody(response?.data);
            const items = stripManagedFields(responseBody?.items ?? []);
            const nextPageToken = responseBody?.metadata?.continue;

            this.logger.debug('Fetched items from Kubearchive', {
                cluster,
                namespace,
                resource,
                itemCount: items.length,
                hasNextPageToken: !!nextPageToken,
            });

            return { results: items, nextPageToken };
        } catch (error) {
            this.logger.error('Error fetching from Kubearchive', error, {
                cluster,
                namespace,
                resource,
            });
            throw error;
        }
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
