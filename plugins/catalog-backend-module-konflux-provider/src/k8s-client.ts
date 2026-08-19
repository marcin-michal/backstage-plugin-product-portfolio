import { LoggerService } from '@backstage/backend-plugin-api';
import { K8sListItem, K8sListResponse, K8sResource } from './types';

const TENANT_LABEL_SELECTOR = 'konflux-ci.dev/type=tenant';
const FETCH_CONCURRENCY = 8;

export class KonfluxK8sClient {
    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
        private readonly clusterId: string,
        private readonly logger: LoggerService,
    ) {}

    async discoverTenantNamespaces(): Promise<string[]> {
        const url =
            `${this.baseUrl}/api/v1/namespaces` +
            `?labelSelector=${encodeURIComponent(TENANT_LABEL_SELECTOR)}`;

        const data = await this.get(url);
        const items = (data?.items ?? []) as K8sListItem[];

        return items
            .filter(item => {
                const labels = item.metadata?.labels;
                if (labels?.['konflux-ci.dev/type'] === 'tenant') {
                    return true;
                }

                return (item.metadata?.name ?? '').endsWith('-tenant');
            })
            .map(item => item.metadata?.name)
            .filter((name): name is string => !!name)
            .sort();
    }

    async fetchAcrossNamespaces(
        namespaces: string[],
        group: string,
        version: string,
        plural: string,
    ): Promise<K8sResource[]> {
        const all: K8sResource[] = [];

        await mapPool(namespaces, FETCH_CONCURRENCY, async ns => {
            try {
                const items = await this.fetchAllPages(
                    group,
                    version,
                    ns,
                    plural,
                );
                all.push(...items);
            } catch (error) {
                const status = getStatusCode(error);
                if (status === 403 || status === 404) {
                    this.logger.debug(
                        `Skipping ${plural} in ${this.clusterId}/${ns}: HTTP ${status}`,
                    );
                    return;
                }
                this.logger.warn(
                    `Error fetching ${plural} from ${this.clusterId}/${ns}`,
                    { error: errorMsg(error) },
                );
            }
        });

        return all;
    }

    private async fetchAllPages(
        group: string,
        version: string,
        namespace: string,
        plural: string,
    ): Promise<K8sResource[]> {
        const items: K8sResource[] = [];
        let continueToken: string | undefined;

        do {
            const qs = continueToken
                ? `?limit=500&continue=${encodeURIComponent(continueToken)}`
                : '?limit=500';
            const url =
                `${this.baseUrl}/apis/${group}/${version}` +
                `/namespaces/${namespace}/${plural}${qs}`;

            const data = await this.get(url);
            items.push(...((data?.items ?? []) as K8sResource[]));
            continueToken = data?.metadata?.continue as string | undefined;
        } while (continueToken);

        return items;
    }

    private async get(url: string): Promise<K8sListResponse> {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const err = new Error(
                `K8s API ${response.status} on ${this.clusterId}: ${body.slice(
                    0,
                    200,
                )}`,
            );
            (err as Error & { statusCode: number }).statusCode =
                response.status;
            throw err;
        }

        return (await response.json()) as K8sListResponse;
    }
}

function getStatusCode(error: unknown): number | undefined {
    if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
        return (error as { statusCode: number }).statusCode;
    }
    return undefined;
}

function errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function mapPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    if (items.length === 0) return;
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
