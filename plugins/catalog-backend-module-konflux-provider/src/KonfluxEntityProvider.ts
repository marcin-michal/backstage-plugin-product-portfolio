import { Entity } from '@backstage/catalog-model';
import {
    EntityProvider,
    EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
    LoggerService,
    SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { KonfluxK8sClient } from './k8s-client';
import { toApplicationEntity, toComponentEntity } from './entity-mapper';
import {
    K8sResource,
    KonfluxClusterProviderConfig,
    RpaIndex,
    RpaMappingComponent,
} from './types';

const PROVIDER_NAME = 'konflux-entity-provider';
const LOCATION_KEY = `konflux-provider:${PROVIDER_NAME}`;

export class KonfluxEntityProvider implements EntityProvider {
    private connection?: EntityProviderConnection;

    constructor(
        private readonly clusters: KonfluxClusterProviderConfig[],
        private readonly logger: LoggerService,
        private readonly taskRunner: SchedulerServiceTaskRunner,
    ) {}

    getProviderName(): string {
        return PROVIDER_NAME;
    }

    async connect(connection: EntityProviderConnection): Promise<void> {
        this.connection = connection;
        await this.taskRunner.run({
            id: this.getProviderName(),
            fn: async () => {
                await this.run();
            },
        });
    }

    async run(): Promise<void> {
        if (!this.connection) {
            throw new Error('KonfluxEntityProvider not initialized');
        }

        this.logger.info('Starting Konflux entity sync', {
            clusterCount: this.clusters.length,
        });

        const allEntities: Entity[] = [];

        for (const cluster of this.clusters) {
            try {
                const entities = await this.syncCluster(cluster);
                allEntities.push(...entities);
            } catch (error) {
                this.logger.error(
                    `Failed to sync cluster ${cluster.clusterId}`,
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }

        await this.connection.applyMutation({
            type: 'full',
            entities: allEntities.map(entity => ({
                entity,
                locationKey: LOCATION_KEY,
            })),
        });

        this.logger.info('Konflux entity sync complete', {
            entityCount: allEntities.length,
        });
    }

    private async syncCluster(
        cluster: KonfluxClusterProviderConfig,
    ): Promise<Entity[]> {
        const { clusterId, apiUrl, serviceToken, managedNamespaces } = cluster;
        const base = apiUrl.replace(/\/+$/, '');

        const client = new KonfluxK8sClient(
            base,
            serviceToken,
            clusterId,
            this.logger,
        );

        const tenantNamespaces = await client.discoverTenantNamespaces();
        this.logger.info(
            `Discovered ${tenantNamespaces.length} tenant namespaces on ${clusterId}`,
        );

        const applications = await client.fetchAcrossNamespaces(
            tenantNamespaces,
            'appstudio.redhat.com',
            'v1alpha1',
            'applications',
        );

        const components = await client.fetchAcrossNamespaces(
            tenantNamespaces,
            'appstudio.redhat.com',
            'v1alpha1',
            'components',
        );

        const rpas = await client.fetchAcrossNamespaces(
            managedNamespaces,
            'appstudio.redhat.com',
            'v1alpha1',
            'releaseplanadmissions',
        );

        this.logger.info(`Fetched resources from ${clusterId}`, {
            applications: applications.length,
            components: components.length,
            rpas: rpas.length,
        });

        const rpaIndex = buildRpaIndex(rpas);

        const componentCounts = new Map<string, number>();
        for (const comp of components) {
            const appName = comp.spec?.application as string | undefined;
            if (appName) {
                const key = `${comp.metadata?.namespace}/${appName}`;
                componentCounts.set(key, (componentCounts.get(key) ?? 0) + 1);
            }
        }

        // Emit catalog entities
        const entities: Entity[] = [];

        for (const app of applications) {
            if (!app.metadata?.uid) continue;
            const key = `${app.metadata?.namespace}/${app.metadata?.name}`;
            entities.push(
                toApplicationEntity(
                    app,
                    clusterId,
                    componentCounts.get(key) ?? 0,
                    rpaIndex,
                ),
            );
        }

        for (const comp of components) {
            if (!comp.metadata?.uid) continue;
            entities.push(toComponentEntity(comp, clusterId, rpaIndex));
        }

        return entities;
    }
}

function buildRpaIndex(rpas: K8sResource[]): RpaIndex {
    const index: RpaIndex = new Map();

    for (const rpa of rpas) {
        const originNs = (rpa.spec?.origin as string) ?? '';
        const appNames = (rpa.spec?.applications as string[]) ?? [];
        const mapping = rpa.spec?.data as
            | { mapping?: { components?: RpaMappingComponent[] } }
            | undefined;
        const mappedComponents = mapping?.mapping?.components ?? [];

        for (const appName of appNames) {
            const key = `${originNs}/${appName}`;
            let entry = index.get(key);
            if (!entry) {
                entry = { components: new Map(), allRepos: [] };
                index.set(key, entry);
            }

            for (const mc of mappedComponents) {
                const repos = extractRepositories(mc);
                const compName = mc.name ?? '';
                const existing = entry.components.get(compName) ?? [];
                entry.components.set(compName, [...existing, ...repos]);
                entry.allRepos.push(...repos);
            }
        }
    }

    // Deduplicate
    for (const entry of index.values()) {
        entry.allRepos = [...new Set(entry.allRepos)];
        for (const [comp, repos] of entry.components) {
            entry.components.set(comp, [...new Set(repos)]);
        }
    }

    return index;
}

function extractRepositories(comp: RpaMappingComponent): string[] {
    const repos: string[] = [];
    if (comp.repository) repos.push(comp.repository);
    if (comp.repositories) {
        for (const r of comp.repositories) {
            if (r.url) repos.push(r.url);
        }
    }
    return repos;
}
