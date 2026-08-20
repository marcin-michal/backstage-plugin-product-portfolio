import { LoggerService } from '@backstage/backend-plugin-api';
import {
    K8sResourceCommonWithClusterInfo,
    KonfluxConfig,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxLogger } from '../helpers/logger';
import { HttpStatusError } from '../helpers/errors';

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
        name?: string;
    };
}

/**
 * List archived custom resources from KubeArchive using the same path shape
 * as the Kubernetes API. Query params follow the KubeArchive API (limit,
 * continue, labelSelector, name) — not Kubernetes fieldSelector.
 */
export class KubearchiveService {
    private readonly logger: KonfluxLogger;

    constructor(logger: LoggerService) {
        this.logger = new KonfluxLogger(logger);
    }

    async fetchResources(params: FetchResourcesOptions): Promise<{
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

        const baseUrl = konfluxConfig.clusters?.[cluster]?.kubearchiveApiUrl;
        if (!baseUrl) {
            throw new Error(
                `Cluster '${cluster}' not found or missing kubearchiveApiUrl`,
            );
        }

        const url = new URL(
            `${baseUrl.replace(
                /\/$/,
                '',
            )}/apis/${apiGroup}/${apiVersion}/namespaces/${encodeURIComponent(
                namespace,
            )}/${resource}`,
        );
        if (options.pageSize !== undefined) {
            url.searchParams.set('limit', String(options.pageSize));
        }
        if (options.pageToken) {
            url.searchParams.set('continue', options.pageToken);
        }
        if (options.labelSelector) {
            url.searchParams.set('labelSelector', options.labelSelector);
        }
        if (options.name) {
            url.searchParams.set('name', options.name);
        }

        this.logger.debug('Fetching items from Kubearchive', {
            cluster,
            namespace,
            resource,
            url: url.toString(),
        });

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new HttpStatusError(
                `KubeArchive list ${resource} on '${cluster}/${namespace}' failed: HTTP ${
                    response.status
                }${body ? `: ${body}` : ''}`,
                response.status,
            );
        }

        const responseBody = parseResponseBody(await response.json());
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
