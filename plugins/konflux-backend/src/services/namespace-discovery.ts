import { LoggerService } from '@backstage/backend-plugin-api';
import { StructuredLogger } from '../helpers/logger';
import { HttpStatusError } from '../helpers/errors';

/** Label Konflux uses so tenant namespaces appear in the console. */
export const KONFLUX_TENANT_LABEL_SELECTOR = 'konflux-ci.dev/type=tenant';

interface NamespaceListItem {
    metadata?: {
        name?: string;
        labels?: Record<string, string>;
    };
}

/**
 * Discover namespaces the user can work with on a Konflux cluster.
 *
 * Prefers the same shape Konflux UI uses (`GET /api/v1/namespaces` with the
 * tenant label). Falls back to OpenShift Projects with the same label selector
 * when core Namespace list is forbidden.
 */
export class NamespaceDiscoveryService {
    private readonly logger: StructuredLogger;

    constructor(logger: LoggerService) {
        this.logger = new StructuredLogger(logger);
    }

    async listAccessibleTenantNamespaces(
        apiUrl: string,
        token: string,
        clusterId: string,
    ): Promise<string[]> {
        const base = apiUrl.replace(/\/$/, '');

        try {
            return await this.listFromApi(
                `${base}/api/v1/namespaces?labelSelector=${encodeURIComponent(
                    KONFLUX_TENANT_LABEL_SELECTOR,
                )}`,
                token,
                clusterId,
                'namespaces',
            );
        } catch (error) {
            if (
                error instanceof HttpStatusError &&
                (error.statusCode === 403 || error.statusCode === 401)
            ) {
                this.logger.info(
                    'Core Namespace list forbidden; falling back to OpenShift Projects',
                    { cluster: clusterId, statusCode: error.statusCode },
                );
                return this.listFromApi(
                    `${base}/apis/project.openshift.io/v1/projects?labelSelector=${encodeURIComponent(
                        KONFLUX_TENANT_LABEL_SELECTOR,
                    )}`,
                    token,
                    clusterId,
                    'projects',
                );
            }
            throw error;
        }
    }

    private async listFromApi(
        url: string,
        token: string,
        clusterId: string,
        source: 'namespaces' | 'projects',
    ): Promise<string[]> {
        this.logger.debug(`Listing Konflux tenant ${source}`, {
            cluster: clusterId,
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
                `Failed to list ${source} on cluster '${clusterId}': HTTP ${
                    response.status
                }${body ? `: ${body}` : ''}`,
                response.status,
            );
        }

        const data = (await response.json()) as {
            items?: NamespaceListItem[];
        };

        // Defense in depth: keep only Konflux tenant namespaces even if the
        // API ignored the labelSelector.
        const names = (data.items ?? [])
            .filter(item => isKonfluxTenant(item))
            .map(item => item.metadata?.name)
            .filter((name): name is string => !!name)
            .sort((a, b) => a.localeCompare(b));

        this.logger.info(`Listed Konflux tenant ${source}`, {
            cluster: clusterId,
            namespaceCount: names.length,
        });

        return names;
    }
}

function isKonfluxTenant(item: NamespaceListItem): boolean {
    const labels = item.metadata?.labels;
    if (labels?.['konflux-ci.dev/type'] === 'tenant') {
        return true;
    }
    // Some environments only convey tenancy via naming.
    const name = item.metadata?.name ?? '';
    return name.endsWith('-tenant');
}
